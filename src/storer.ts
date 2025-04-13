import { NewArticleDto, NewCommentDto, NewReplyDto } from './interface';

export default class Storer {
    #endpoint: string;

    constructor(platform: string) {
        this.#endpoint = `http://localhost:8080/${platform}`;
        console.log(`Initialized storer for platform: ${platform}`);
    }

    /**
     * Saves article data to storage
     * @param {NewArticleDto} article - The article data to save
     * @returns {Promise<boolean>} Whether the operation was successful
     */
    async storeArticle(article: NewArticleDto): Promise<boolean> {
        console.log(`Attempting to store article: ${article.id}`);
        try {
            const response = await fetch(`${this.#endpoint}/articles`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(article),
            });

            if (!response.ok) {
                console.error(
                    `Failed to store article ${article.id}: ${response.statusText}`
                );
                return false;
            }
            
            console.log(`Successfully stored article: ${article.id}`);
            return true;
        } catch (error) {
            console.error(`Error storing article ${article.id}:`, error);
            return false;
        }
    }

    /**
     * Stores a comment to the backend
     * @param {string} articleId - The article ID
     * @param {NewCommentDto} comment - The comment to store
     * @returns {Promise<boolean>} Whether the operation was successful
     */
    async storeComment(articleId: string, comment: NewCommentDto): Promise<boolean> {
        console.log(`Attempting to store comment: ${comment.id} for article: ${articleId}`);
        try {
            const response = await fetch(`${this.#endpoint}/articles/${articleId}/comments`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(comment),
            });
            
            if (!response.ok) {
                console.error(`Failed to store comment ${comment.id}: ${response.statusText}`);
                return false;
            }
            
            console.log(`Successfully stored comment: ${comment.id}`);
            return true;
        } catch (error) {
            console.error(`Error storing comment ${comment.id}:`, error);
            return false;
        }
    }

    /**
     * Stores a reply to the backend
     * @param {string} articleId - The article ID
     * @param {string} commentId - The parent comment ID
     * @param {NewReplyDto} reply - The reply to store
     * @returns {Promise<boolean>} Whether the operation was successful
     */
    async storeReply(articleId: string, commentId: string, reply: NewReplyDto): Promise<boolean> {
        console.log(`Attempting to store reply: ${reply.id} for comment: ${commentId}`);
        try {
            const response = await fetch(
                `${this.#endpoint}/articles/${articleId}/comments/${commentId}/replies`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(reply),
                }
            );
            
            if (!response.ok) {
                console.error(`Failed to store reply ${reply.id}: ${response.statusText}`);
                return false;
            }
            
            console.log(`Successfully stored reply: ${reply.id}`);
            return true;
        } catch (error) {
            console.error(`Error storing reply ${reply.id}:`, error);
            return false;
        }
    }
}