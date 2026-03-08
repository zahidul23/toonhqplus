// Intercept WebSocket connections to log messages
(function() {
  if (window.__toonhq_ws_hooked) return;
  window.__toonhq_ws_hooked = true;

  const originalWebSocket = window.WebSocket;

  window.WebSocket = function (url, protocols) {
    const ws = new originalWebSocket(url, protocols);

    if (url.toString().includes('toonhq.org/socket.io')) {
      console.log('[ToonHQ+] WebSocket created:', url);

      ws.addEventListener('message', (event) => {
        try {
          // Socket.io messages often start with numbers like "42", then a JSON array
          // Check if the message is a string and has the socket.io format
          if (typeof event.data === 'string') {
            const match = event.data.match(/^(\d+)(.*)$/);
            if (match) {
              const prefix = match[1];
              const payload = match[2];
              
              if (payload) {
                const parsed = JSON.parse(payload);
                console.log('[ToonHQ+] WebSocket Message:', parsed);
              } else {
                // Just a ping/pong or connection message
                // console.log('[ToonHQ+] WebSocket Control:', prefix);
              }
            } else {
              console.log('[ToonHQ+] WebSocket Raw Message:', event.data);
            }
          }
        } catch (e) {
          // Fallback for non-JSON or other formats
          console.log('[ToonHQ+] WebSocket Message (Raw):', event.data);
        }
      });
    }

    return ws;
  };
  // Copy prototype so instanceof checks still work
  window.WebSocket.prototype = originalWebSocket.prototype;
})();
