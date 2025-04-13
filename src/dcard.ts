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

interface DcardReplyResponse extends Array<{
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

// Initialize the storer
const storer = new Storer('dcard');

/**
 * Scrapes article data from the current page
 * @returns {NewArticleDto} The article data
 */
function scrapeArticleData(): NewArticleDto {
  const title = document.querySelector<HTMLHeadingElement>("h1")?.innerText;
  const date = document.querySelector<HTMLTimeElement>("article time")?.dateTime;
  const content = document.querySelector<HTMLDivElement>(
    "article .d_ma_2n.d_gr0vis_23.c1golu5u"
  )?.innerText;
  const url = document.querySelector<HTMLLinkElement>("link[rel=canonical]")?.href;
  const articleId = url?.split("/").pop();

  if (!title || !date || !content || !url || !articleId) {
    throw new Error("Failed to scrape article data: missing required data");
  }

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
  } else if (data.withNickname) {
    return `@${data.school} (@${data.department}, ${data.gender})`;
  } else {
    return `${data.school}${
      data.department ? ` ${data.department}` : ""
    } (${data.gender})`;
  }
}

/**
 * Fetches comments for an article
 * @param {string} articleId - The article ID
 * @returns {Promise<Comment[]>} Array of comments
 */
async function fetchComments(articleId: string): Promise<NewCommentDto[]> {
  const allComments: NewCommentDto[] = [];
  let nextKey: string | null = null;
  
  for (let i = 0; i < MAX_COMMENT_PAGES; i++) {
    console.log(`Extracting comment page (${i + 1}/${MAX_COMMENT_PAGES})...`);

    try {
      const response = await fetch(
        `https://www.dcard.tw/service/api/v2/commentRanking/posts/${articleId}/comments?negative=downvote${
          nextKey ? `&nextKey=${nextKey}` : ""
        }`
      );
      
      if (!response.ok) {
        console.error(`Failed to fetch comments page ${i + 1}: ${response.statusText}`);
        break;
      }
      
      const data: DcardCommentResponse = await response.json();
      
      for (const item of data.items) {
        const comment: NewCommentDto = {
          id: item.id,
          content: item.content,
          author: formatAuthor(item),
          likes: item.likeCount,
          created_at: item.createdAt,
        };
        
        allComments.push(comment);
        
        // Store the comment
        await storer.storeComment(articleId, comment);
        
        // If the comment has replies, fetch and store them
        if (item.subCommentCount > 0) {
          await fetchAndStoreReplies(articleId, item.id);
        }
      }
      
      nextKey = data.nextKey;
      
      // If there are no more comments, break the loop
      if (!nextKey) break;
      
    } catch (error) {
      console.error(`Error fetching comments page ${i + 1}:`, error);
      break;
    }
  }
  
  return allComments;
}

/**
 * Fetches and stores replies for a comment
 * @param {string} articleId - The article ID
 * @param {string} commentId - The parent comment ID
 * @returns {Promise<NewReplyDto[]>} Array of replies
 */
async function fetchAndStoreReplies(articleId: string, commentId: string): Promise<NewReplyDto[]> {
  console.log(`Extracting replies for comment ${commentId}...`);
  
  try {
    const response = await fetch(
      `https://www.dcard.tw/service/api/v2/posts/${articleId}/comments?parentId=${commentId}&limit=${COMMENTS_PER_PAGE}`
    );
    
    if (!response.ok) {
      console.error(`Failed to fetch replies for comment ${commentId}: ${response.statusText}`);
      return [];
    }
    
    const data: DcardReplyResponse = await response.json();
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
  try {
    // 1. Scrape article data
    const article = scrapeArticleData();
    console.log(`Starting extraction for article: ${article.id}`);
    
    // 2. Store the article
    const articleStored = await storer.storeArticle(article);
    if (!articleStored) {
      console.error("Failed to store article. Aborting extraction.");
      return;
    }
    
    // 3. Fetch and store comments (which will also fetch and store replies)
    await fetchComments(article.id);
    
    console.log("Extraction completed successfully!");
  } catch (error) {
    console.error("Error during extraction:", error);
  }
}

// Execute the main function
main().catch(console.error);
