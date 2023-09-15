(function () {
  "use strict";

  const API_BASE_URL = "https://amc.flexsked.com"; // Replace with actual API URL
  const POLLING_INTERVAL = 10000; // Poll every 10 seconds

  let recipientId = null;
  let accessToken = null;
  let lastNotificationId = null;
  let pollingInterval;

  const keepAlive = () => setInterval(chrome.runtime.getPlatformInfo, 20e3);
  chrome.runtime.onStartup.addListener(keepAlive);
  keepAlive();

  // Authentication and start on extension startup or installation

  async function authenticateAndStart() {
    const cookies = await getCookie("directus_refresh_token");

    if (!cookies) {
      console.log("No refresh token cookie found. Retrying...");

      // Wait for 10 seconds before retrying
      setTimeout(authenticateAndStart, 10000);

      return;
    }
    console.log("cookies found" + cookies.value);
    const newAccessToken = await refreshAccessToken(cookies.value);

    if (!newAccessToken) {
      console.error("Failed to refresh access token.");
      return;
    }

    accessToken = newAccessToken;
    recipientId = await getRecipientId(newAccessToken);
    startNotificationPolling();
  }

  // Get cookie using Promise
  function getCookie(name) {
    return new Promise((resolve) => {
      chrome.cookies.get({ url: API_BASE_URL, name: name }, (cookie) => {
        resolve(cookie);
      });
    });
  }

  function setCookie(name, value) {
    return new Promise((resolve) => {
      chrome.cookies.set(
        { url: API_BASE_URL, name: name, value: value },
        (cookie) => {
          resolve(cookie);
        }
      );
    });
  }

  // Refresh access token
  async function refreshAccessToken(refreshToken) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          refresh_token: refreshToken,
          mode: "json",
        }),
      });

      const data = await response.json();
      setCookie("directus_refresh_token", data.data.refresh_token);

      if (data && data.data && data.data.access_token) {
        return data.data.access_token;
      } else {
        console.error("Access token not found in refresh response.");
        return null;
      }
    } catch (error) {
      console.error("Error refreshing access token:", error);
      return null;
    }
  }

  // Fetch recipient ID
  async function getRecipientId(token) {
    try {
      const response = await fetch(`${API_BASE_URL}/users/me`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      return data.data.id;
    } catch (error) {
      console.error("Error fetching recipient ID:", error);
      return null;
    }
  }

  // Start notification polling
  function startNotificationPolling() {
    clearInterval(pollingInterval);

    pollingInterval = setInterval(async () => {
      await checkNotifications();
    }, POLLING_INTERVAL);

    chrome.runtime.onSuspend.addListener(() => {
      startNotificationPolling();
    });
  }

  // Check notifications
  async function checkNotifications() {
    if (accessToken) {
      try {
        const response = await fetch(
          `${API_BASE_URL}/notifications?filter[_and][0][recipient][_eq]=${recipientId}&filter[_and][1][status][_eq]=inbox&fields[]=id&fields[]=subject&fields[]=collection&fields[]=item&fields[]=timestamp&sort[]=-timestamp&limit=1`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        const data = await response.json();

        if (
          data &&
          data.data &&
          data.data.length > 0 &&
          data.data[0].id !== lastNotificationId
        ) {
          lastNotificationId = data.data[0].id;
          const subject = data.data[0].subject;

          if (subject === "You_have_new_walkin_user") {
            showNotification();
          }
        }
      } catch (error) {
        console.error("Error fetching notifications:", error);
      }
    } else {
      console.log("call authenticate");
      authenticateAndStart();
    }
  }

  // Show notification
  function showNotification() {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "logo.png", // Make sure the logo.png file is in the same directory as your manifest file
      title: "New Walk-In User",
      message: "You have a new walk-in user!",
      requireInteraction: true,
    });
  }

  // Initialize extension on startup or installation
  chrome.runtime.onStartup.addListener(authenticateAndStart);
  chrome.runtime.onInstalled.addListener(authenticateAndStart);

  // Listen for messages
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "startNotificationPolling") {
      accessToken = message.accessToken;
      startNotificationPolling();
    }
  });

  // Log extension installation
  chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed");
  });

  // Keep extension alive on startup
  chrome.runtime.onStartup.addListener(() => {
    console.log("Extension installed");
    // Keep extension alive logic
  });

  // Other event listeners and functions can be added as needed
})();
