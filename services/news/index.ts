/**
 * News Services Index
 *
 * Exports all news-related services for easy imports
 */

export {
    newsCreationService,
    type CreateNewsRequest,
    type CreateNewsResponse
} from "./createNews";

export {
    attachNewsListener, deleteNews, fetchNews,
    fetchNewsItem, hasUserReadNews, markNewsAsRead, updateNews,
    type News,
    type NewsListenerOptions
} from "./newsListener";

