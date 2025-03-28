import axios from "axios";
import { SearchResult } from "../../src/lib/entities";
import { logger } from "../../src/lib/logger";

// Exponential backoff implementation
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Search using Brave Search API
 * @param query The search query
 * @param options Search options
 * @returns Array of SearchResult objects
 */
export async function braveSearch(
  query: string,
  options: {
    num_results?: number;
    lang?: string;
    country?: string;
    timeout?: number;
  } = {}
): Promise<SearchResult[]> {
  const BRAVE_SEARCH_API_KEY = process.env.BRAVE_SEARCH_API_KEY;
  
  if (!BRAVE_SEARCH_API_KEY) {
    logger.warn("Brave Search API key not configured");
    throw new Error("Brave Search API key not configured");
  }
  
  const { num_results = 10, lang = "en", country = "us", timeout = 5000 } = options;
  let retryCount = 0;
  const maxRetries = 3;
  const baseRetryDelay = 1000;
  
  while (retryCount <= maxRetries) {
    try {
      const response = await axios({
        method: 'GET',
        url: 'https://api.search.brave.com/res/v1/web/search',
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': BRAVE_SEARCH_API_KEY
        },
        params: {
          q: query,
          count: num_results,
          country: country,
          ui_lang: lang
        },
        timeout: timeout
      });
      
      if (!response.data.web?.results?.length) {
        logger.info("Brave Search API returned no results", { query });
        return [];
      }
      
      // Transform response to SearchResult objects
      return response.data.web.results.map(item => 
        new SearchResult(
          item.url,
          item.title,
          item.description
        )
      );
    } catch (error) {
      if (error.response?.status === 429 || error.response?.status === 503) {
        // Rate limited or service unavailable - apply exponential backoff
        if (retryCount < maxRetries) {
          const delay = baseRetryDelay * Math.pow(2, retryCount);
          logger.warn(`Brave Search API rate limited, retrying in ${delay}ms (${retryCount + 1}/${maxRetries})`, {
            status: error.response?.status,
            statusText: error.response?.statusText
          });
          await wait(delay);
          retryCount++;
          continue;
        }
      }
      
      // Log detailed error info
      logger.error("Brave Search API error", { 
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      
      throw new Error(`Brave Search API error: ${error.message}`);
    }
  }
  
  // This should not be reached due to the while loop condition, but TypeScript requires a return
  return [];
}
