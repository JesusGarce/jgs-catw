// popup.js
document.addEventListener('DOMContentLoaded', () => {
    const statusEl = document.getElementById('status');
    const dataDisplayEl = document.getElementById('data-display');
    const tweetCountEl = document.getElementById('tweet-count');
    const sendButton = document.getElementById('send-button');
    const authButton = document.getElementById('auth-button');
    const openWebappButton = document.getElementById('open-webapp-button');
    const messageBox = document.getElementById('message-box');
    const userInfo = document.getElementById('user-info');
    const userDisplay = document.getElementById('user-display');
  
    // Check authentication status
    checkAuthenticationStatus();

    // Request the current number of tweets from the content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'requestCount' }, (response) => {
        if (response && response.count !== undefined) {
          updatePopup(response.count);
        }
      });
    });
  
    // Listen for messages from the content script to update the count
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'updateCount') {
        updatePopup(request.count);
      }
    });
  
    // Handle the button click to send data
    sendButton.addEventListener('click', () => {
      sendButton.disabled = true;
      sendButton.textContent = 'Enviando...';
      messageBox.style.display = 'none';

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'sendData' }, (response) => {
          sendButton.disabled = false;
          sendButton.textContent = 'Enviar a Backend';
          if (response && response.status === 'success') {
            showMessage(response.message || '¡Datos enviados con éxito!', 'message-success');
          } else {
            showMessage(response.message || 'Error al enviar los datos. Revisa la consola.', 'message-error');
          }
        });
      });
    });

    // Handle authentication button click
    authButton.addEventListener('click', () => {
      const token = prompt('Ingresa tu token de autenticación (obténlo desde la aplicación web):');
      if (token) {
        chrome.storage.local.set({ authToken: token }, () => {
          showMessage('Token guardado exitosamente', 'message-success');
          verifyTokenWithBackend(token);
        });
      }
    });

    // Handle open webapp button click
    openWebappButton.addEventListener('click', () => {
      chrome.tabs.create({ url: 'http://127.0.0.1:4321' });
    });
  
    function updatePopup(count) {
      if (count > 0) {
        statusEl.style.display = 'none';
        dataDisplayEl.style.display = 'block';
        sendButton.style.display = 'block';
        tweetCountEl.textContent = count;
      } else {
        statusEl.style.display = 'block';
        dataDisplayEl.style.display = 'none';
        sendButton.style.display = 'none';
      }
    }

    function checkAuthenticationStatus() {
      // Primero verificar si ya tenemos un token guardado
      chrome.storage.local.get(['authToken'], (result) => {
        const storedToken = result.authToken;
        
        if (storedToken) {
          // Verificar si el token sigue siendo válido
          verifyTokenWithBackend(storedToken);
        } else {
          // Intentar obtener el token desde la aplicación web
          getTokenFromWebApp();
        }
      });
    }

    function verifyTokenWithBackend(token) {
      fetch('http://127.0.0.1:3001/api/v1/auth/status', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      .then(response => {
        if (response.ok) {
          return response.json();
        } else {
          throw new Error('Token inválido');
        }
      })
      .then(data => {
        if (data.authenticated) {
          updateAuthStatus(true, data.user);
        } else {
          throw new Error('No autenticado');
        }
      })
      .catch(error => {
        console.log('Token inválido, intentando obtener desde la web app:', error);
        getTokenFromWebApp();
      });
    }

    function getTokenFromWebApp() {
      // Intentar obtener el token desde localStorage de la aplicación web
      chrome.tabs.query({ url: 'http://127.0.0.1:4321/*' }, (tabs) => {
        if (tabs.length > 0) {
          // Hay una pestaña abierta de la aplicación web
          chrome.tabs.sendMessage(tabs[0].id, { action: 'getAuthToken' }, (response) => {
            if (response && response.token) {
              // Guardar el token y verificar
              chrome.storage.local.set({ authToken: response.token }, () => {
                verifyTokenWithBackend(response.token);
              });
            } else {
              updateAuthStatus(false);
            }
          });
        } else {
          // No hay pestaña de la aplicación web abierta
          updateAuthStatus(false);
        }
      });
    }

    function updateAuthStatus(hasAuth, userInfoData = null) {
      if (hasAuth) {
        authButton.style.display = 'none';
        openWebappButton.style.display = 'none';
        sendButton.disabled = false;
        
        if (userInfoData) {
          // Mostrar información del usuario
          userInfo.style.display = 'block';
          userDisplay.textContent = `${userInfoData.displayName} (@${userInfoData.username})`;
          showMessage('Autenticación exitosa', 'message-success');
        } else {
          userInfo.style.display = 'none';
        }
      } else {
        authButton.style.display = 'block';
        openWebappButton.style.display = 'block';
        sendButton.disabled = true;
        userInfo.style.display = 'none';
        showMessage('Configura tu token de autenticación para enviar datos', 'message-error');
      }
    }
  
    function showMessage(message, className) {
      messageBox.textContent = message;
      messageBox.className = ''; // Clear previous classes
      messageBox.classList.add(className);
      messageBox.style.display = 'block';
    }
  });
  