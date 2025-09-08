// content.js
// This script runs on the twitter.com/i/bookmarks page.
let scrapedTweets = new Map();

// Scrape all existing tweets on the page when the script is first loaded.
const initialTweets = document.querySelectorAll('article[data-testid="tweet"]');
initialTweets.forEach(scrapeTweet);
chrome.runtime.sendMessage({ action: 'updateCount', count: scrapedTweets.size });

// The observer watches for new tweets being added to the DOM.
const observer = new MutationObserver(mutations => {
  mutations.forEach(mutation => {
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach(node => {
        // We look for a specific element that represents a tweet.
        if (node.nodeType === 1) {
          const tweetElement = node.querySelector('article[data-testid="tweet"]');
          if (tweetElement) {
            scrapeTweet(tweetElement);
          }
        }
      });
    }
  });
});

// Start observing the body for new content.
observer.observe(document.body, { childList: true, subtree: true });

// Listen for messages from the popup or background script.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'requestCount') {
    sendResponse({ count: scrapedTweets.size });
  } else if (request.action === 'sendData') {
    // Send the collected data to the background script for API call.
    chrome.runtime.sendMessage({
      action: 'sendDataToBackend',
      data: Array.from(scrapedTweets.values())
    }, (response) => {
      sendResponse(response);
    });
    return true; // Indicates we will send a response asynchronously.
  }
});

function scrapeTweet(tweetElement) {
  try {
    // Get the tweet URL first to use it as a unique key.
    const tweetUrlEl = tweetElement.querySelector('a[href*="/status/"]');
    const tweetUrl = tweetUrlEl ? tweetUrlEl.href : null;

    if (!tweetUrl || scrapedTweets.has(tweetUrl)) {
        // Avoid scraping the same tweet twice.
        return;
    }

    const userProfileEl = tweetElement.querySelector('a[role="link"][tabindex="-1"]');
    const contentEl = tweetElement.querySelector('div[data-testid="tweetText"]');
    const mediaImageEl = tweetElement.querySelector('div[data-testid="tweetPhoto"] img');
    const mediaVideoEl = tweetElement.querySelector('div[data-testid="videoPlayer"] video');
    const mediaLinkEl = tweetElement.querySelector('div[data-testid="card.wrapper"] a');

    // Use optional chaining (?) for safer access to properties
    const userNameElement = tweetElement.querySelector('div[data-testid="User-Name"] div[dir="ltr"] > span > span');
    const userHandleElement = tweetElement.querySelector('div[data-testid="User-Name"] a[role="link"][tabindex="-1"] > div > span');

    const userName = userNameElement?.textContent?.trim() || 'N/A';
    const userHandle = userHandleElement?.textContent?.trim() || 'N/A';

    const htmlString = tweetElement.innerHTML;
    const imageUrlRegex = /https:\/\/pbs\.twimg\.com\/profile_images\/(.*?)"/;
    const match = htmlString.match(imageUrlRegex);
    const userImageUrl = match ? match[0].slice(0, -1) : 'N/A';

    const tweetData = {
        tweet_url: tweetUrl,
        user_name: userName,
        user_handle: userHandle,
        user_image_url: userImageUrl,
        tweet_content: contentEl?.textContent?.trim() || 'N/A',
        media_url: mediaVideoEl?.src || mediaImageEl?.src || 'N/A',
        media_link: mediaLinkEl?.href || 'N/A'
    };

    scrapedTweets.set(tweetUrl, tweetData);

    // Update the popup with the new count.
    chrome.runtime.sendMessage({ action: 'updateCount', count: scrapedTweets.size });
    
    console.log('Scraped Tweet:', tweetData); // For debugging
  } catch (error) {
    console.error('Error scraping tweet:', error);
  }
}
