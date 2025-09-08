// background.js
// This script runs in the background and acts as a central hub.
let collectedTweets = new Map();

// Listen for messages from content scripts or popup.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'authTokenChanged') {
    // Handle auth token changes from the web app
    if (request.token) {
      chrome.storage.local.set({ authToken: request.token }, () => {
        console.log('Auth token updated from web app');
      });
    } else {
      chrome.storage.local.remove(['authToken'], () => {
        console.log('Auth token removed');
      });
    }
    return;
  }
  if (request.action === 'sendDataToBackend') {
    const tweetsToSend = request.data;
    const backendUrl = 'http://127.0.0.1:3001/api/v1/tweets/extension';

    // Get auth token from storage
    chrome.storage.local.get(['authToken'], (result) => {
      const authToken = result.authToken;
      
      if (!authToken) {
        sendResponse({ 
          status: 'error', 
          message: 'No se encontró token de autenticación. Por favor, inicia sesión en la aplicación web primero.' 
        });
        return;
      }

      fetch(backendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ tweets: tweetsToSend }),
      })
      .then(response => {
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Token de autenticación inválido. Por favor, inicia sesión nuevamente.');
          }
          throw new Error(`Error del servidor: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('Success:', data);
        sendResponse({ 
          status: 'success', 
          message: `Se procesaron ${data.processed} tweets (${data.newTweets} nuevos)` 
        });
      })
      .catch((error) => {
        console.error('Error:', error);
        sendResponse({ status: 'error', message: error.message });
      });
    });
    
    return true; // Required for async response.
  }
});
