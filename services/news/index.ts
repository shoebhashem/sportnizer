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
    addNewsComment,
    attachNewsCommentsListener,
    deleteNewsComment,
    toggleCommentReaction,
    type NewsCommentClient
} from "./newsComments";

export {
    attachNewsItemListener,
    attachNewsListener,
    deleteNews,
    fetchNews,
    fetchNewsItem,
    hasUserReadNews,
    markNewsAsRead,
    updateNews,
    type News,
    type NewsListenerOptions
} from "./newsListener";

export {
    attachUserNewsReactionListener,
    fetchNewsReactions, REACTION_EMOJIS, toggleNewsReaction, type NewsReactionEntry, type NewsReactionResult, type ReactionEmoji
} from "./newsReactions";

