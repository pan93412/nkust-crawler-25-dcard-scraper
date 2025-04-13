/**
 * Dcard Article Scraper
 * Extracts article content, comments, and replies from Dcard pages and
 * stores them in a backend service.
 */

import type { NewArticleDto, NewCommentDto, NewReplyDto } from "./interface";
import Storer from "./storer";

interface DcardCommentResponse {
  items: Array<{
    id: string;
    content: string;
    withNickname?: boolean;
    school: string;
    department?: string;
    gender: string;
    likeCount: number;
    createdAt: string;
    subCommentCount: number;
  }>;
  nextKey: string | null;
}

interface DcardReplyResponse
  extends Array<{
    id: string;
    content: string;
    withNickname?: boolean;
    personaNickname?: string;
    personaUid?: string;
    school: string;
    department?: string;
    gender: string;
    likeCount: number;
    createdAt: string;
  }> {}

// Constants
const MAX_COMMENT_PAGES = 3;
const COMMENTS_PER_PAGE = 20;
const API_REQUEST_DELAY_MS = 500; // Add delay between requests to avoid rate limiting
const RATE_LIMIT_PAUSE_MS = 5000; // Pause for 5 seconds when rate limited

/**
 * Simple delay function to prevent rate limiting
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms + (Math.random() * 200)));

/**
 * Makes a fetch request with retry logic for rate limiting
 * @param {string} url - URL to fetch
 * @param {number} retries - Number of retries allowed (default: 3)
 * @returns {Promise<Response>} - Fetch response
 */
async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  try {
    const response = await fetch(url);
    
    // If rate limited (429)
    if (response.status === 429) {
      if (retries > 0) {
        console.log(`Rate limited (429). Pausing for ${RATE_LIMIT_PAUSE_MS/1000} seconds before retry...`);
        await delay(RATE_LIMIT_PAUSE_MS);
        console.log(`Retrying request (${retries} retries left)...`);
        return fetchWithRetry(url, retries - 1);
      }
    }
    
    return response;
  } catch (error) {
    if (retries > 0) {
      console.error(`Fetch error: ${error}. Retrying in ${RATE_LIMIT_PAUSE_MS/1000} seconds...`);
      await delay(RATE_LIMIT_PAUSE_MS);
      return fetchWithRetry(url, retries - 1);
    }
    throw error;
  }
}

// Initialize the storer
const storer = new Storer("dcard");
console.log("Dcard scraper initialized");

/**
 * Scrapes article data from the current page
 * @returns {NewArticleDto} The article data
 */
function scrapeArticleData(): NewArticleDto {
  console.log("Starting to scrape article data from the page...");

  const title = document.querySelector<HTMLHeadingElement>("h1")?.innerText;
  const date =
    document.querySelector<HTMLTimeElement>("article time")?.dateTime;
  const content = document.querySelector<HTMLDivElement>(
    "article .d_ma_2n.d_gr0vis_23.c1golu5u"
  )?.innerText;
  const url = document.querySelector<HTMLLinkElement>(
    "link[rel=canonical]"
  )?.href;
  const articleId = url?.split("/").pop();

  if (!title || !date || !content || !url || !articleId) {
    console.error("Missing required data in DOM for article scraping");
    throw new Error("Failed to scrape article data: missing required data");
  }

  console.log(`Found article: "${title}" (ID: ${articleId})`);

  return {
    id: articleId,
    url,
    title,
    content,
    created_at: date,
  };
}

/**
 * Formats the author string based on Dcard's user data
 * @param {object} data - The user data
 * @returns {string} Formatted author string
 */
function formatAuthor(data: {
  withNickname?: boolean;
  personaNickname?: string;
  personaUid?: string;
  school: string;
  department?: string;
  gender: string;
}): string {
  if (data.withNickname && data.personaNickname && data.personaUid) {
    return `${data.personaNickname} (@${data.personaUid}, ${data.gender})`;
  }

  if (data.withNickname) {
    return `@${data.school} (@${data.department}, ${data.gender})`;
  }
  return `${data.school}${data.department ? ` ${data.department}` : ""} (${
    data.gender
  })`;
}

/**
 * Fetches comments for an article
 * @param {string} articleId - The article ID
 * @returns {Promise<Comment[]>} Array of comments
 */
async function fetchComments(articleId: string): Promise<NewCommentDto[]> {
  const allComments: NewCommentDto[] = [];
  let nextKey: string | null = null;

  console.log(`Starting to fetch comments for article: ${articleId}`);

  for (let i = 0; i < MAX_COMMENT_PAGES; i++) {
    console.log(`Extracting comment page (${i + 1}/${MAX_COMMENT_PAGES})...`);

    try {
      // Add delay before each API request except the first one
      if (i > 0) {
        console.log(`Waiting ${API_REQUEST_DELAY_MS}ms before next request to avoid rate limiting...`);
        await delay(API_REQUEST_DELAY_MS);
      }

      const requestUrl = `https://www.dcard.tw/service/api/v2/commentRanking/posts/${articleId}/comments?negative=downvote${
        nextKey ? `&nextKey=${nextKey}` : ""
      }`;
      console.log(`Fetching from: ${requestUrl}`);

      const response = await fetchWithRetry(requestUrl);

      if (!response.ok) {
        console.error(
          `Failed to fetch comments page ${i + 1}: ${response.statusText}`
        );
        break;
      }

      const data: DcardCommentResponse = await response.json();
      console.log(`Received ${data.items.length} comments from API`);

      for (const item of data.items) {
        const comment: NewCommentDto = {
          id: item.id,
          content: item.content,
          author: formatAuthor(item),
          likes: item.likeCount,
          created_at: item.createdAt,
        };

        allComments.push(comment);
        console.log(
          `Processing comment: ${item.id} with ${item.subCommentCount} replies`
        );

        // Store the comment
        await storer.storeComment(articleId, comment);

        // If the comment has replies, fetch and store them
        if (item.subCommentCount > 0) {
          await fetchAndStoreReplies(articleId, item.id);
        }
      }

      nextKey = data.nextKey;

      // If there are no more comments, break the loop
      if (!nextKey) {
        console.log("No more comments available (nextKey is null)");
        break;
      }
      
      console.log(`Next page token: ${nextKey}`);
    } catch (error) {
      console.error(`Error fetching comments page ${i + 1}:`, error);
      break;
    }
  }

  console.log(`Finished fetching all comments. Total: ${allComments.length}`);
  return allComments;
}

/**
 * Fetches and stores replies for a comment
 * @param {string} articleId - The article ID
 * @param {string} commentId - The parent comment ID
 * @returns {Promise<NewReplyDto[]>} Array of replies
 */
async function fetchAndStoreReplies(
  articleId: string,
  commentId: string
): Promise<NewReplyDto[]> {
  console.log(`Extracting replies for comment ${commentId}...`);

  try {
    // Add delay before fetching replies to avoid rate limiting
    console.log(`Waiting ${API_REQUEST_DELAY_MS}ms before fetching replies to avoid rate limiting...`);
    await delay(API_REQUEST_DELAY_MS);
    
    const requestUrl = `https://www.dcard.tw/service/api/v2/posts/${articleId}/comments?parentId=${commentId}&limit=${COMMENTS_PER_PAGE}`;
    console.log(`Fetching replies from: ${requestUrl}`);

    const response = await fetchWithRetry(requestUrl);

    if (!response.ok) {
      console.error(
        `Failed to fetch replies for comment ${commentId}: ${response.statusText}`
      );
      return [];
    }

    const data: DcardReplyResponse = await response.json();
    console.log(`Received ${data.length} replies for comment ${commentId}`);

    const replies: NewReplyDto[] = [];

    const storePromises = data.map(async (item) => {
      const reply: NewReplyDto = {
        id: item.id,
        content: item.content,
        author: formatAuthor(item),
        likes: item.likeCount,
        created_at: item.createdAt,
      };

      replies.push(reply);
      return storer.storeReply(articleId, commentId, reply);
    });

    await Promise.all(storePromises);
    console.log(`Stored ${replies.length} replies for comment ${commentId}`);

    return replies;
  } catch (error) {
    console.error(`Error fetching replies for comment ${commentId}:`, error);
    return [];
  }
}

/**
 * Main function to extract and store article data
 */
async function main() {
  console.log("Starting Dcard article extraction process...");

  try {
    // 1. Scrape article data
    const article = scrapeArticleData();
    console.log(
      `Starting extraction for article: ${article.id} - "${article.title}"`
    );
    console.log(`Article content length: ${article.content.length} characters`);

    // 2. Store the article
    console.log("Storing article data...");
    const articleStored = await storer.storeArticle(article);
    if (!articleStored) {
      console.error("Failed to store article. Aborting extraction.");
      return;
    }

    // 3. Fetch and store comments (which will also fetch and store replies)
    console.log("Starting to fetch and store comments...");
    const comments = await fetchComments(article.id);
    console.log(`Successfully processed ${comments.length} comments in total`);

    console.log("Extraction completed successfully!");
  } catch (error) {
    console.error("Error during extraction:", error);
  }
}

// Execute the main function
console.log("Dcard scraper script started");
main()
  .catch(console.error)
  .finally(() => {
    console.log("Dcard scraper script execution finished");
  });
