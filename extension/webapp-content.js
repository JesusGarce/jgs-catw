// webapp-content.js
// This script runs on the web application to provide authentication tokens to the extension

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getAuthToken') {
    try {
      // Get the auth token from localStorage
      const authToken = localStorage.getItem('authToken');
      
      if (authToken) {
        sendResponse({ token: authToken });
      } else {
        sendResponse({ token: null });
      }
    } catch (error) {
      console.error('Error getting auth token:', error);
      sendResponse({ token: null });
    }
    return true; // Indicates we will send a response asynchronously
  }
});

// Optional: Listen for auth token changes and notify the extension
let lastAuthToken = localStorage.getItem('authToken');

// Check for auth token changes periodically
setInterval(() => {
  const currentAuthToken = localStorage.getItem('authToken');
  
  if (currentAuthToken !== lastAuthToken) {
    lastAuthToken = currentAuthToken;
    
    // Notify the extension about the auth token change
    chrome.runtime.sendMessage({
      action: 'authTokenChanged',
      token: currentAuthToken
    }).catch(error => {
      // Ignore errors if extension is not available
      console.log('Extension not available for auth token update');
    });
  }
}, 1000); // Check every second
