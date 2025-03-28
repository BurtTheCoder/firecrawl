import axios from "axios";
import { SearchResult } from "../../src/lib/entities";
import { logger } from "../../src/lib/logger";
import { get_useragent } from "./googlesearch"; // Reuse user agent rotation

// Exponential backoff implementation
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Search using DuckDuckGo API (unofficial)
 * @param query The search query
 * @param options Search options
 * @returns Array of SearchResult objects
 */
export async function duckduckgoSearch(
  query: string,
  options: {
    num_results?: number;
    region?: string;
    timeout?: number;
  } = {}
): Promise<SearchResult[]> {
  const { num_results = 10, region = "us-en", timeout = 5000 } = options;
  let retryCount = 0;
  const maxRetries = 3;
  const baseRetryDelay = 1000;
  
  while (retryCount <= maxRetries) {
    try {
      const response = await axios({
        method: 'GET',
        url: 'https://api.duckduckgo.com/',
        params: {
          q: query,
          format: 'json',
          no_html: '1',
          no_redirect: '1',
          kl: region
        },
        headers: {
          'User-Agent': get_useragent()
        },
        timeout: timeout
      });
      
      // Process results from both organic results and "Results" field
      const results: SearchResult[] = [];
      
      // Add Abstract if available (featured snippet)
      if (response.data.AbstractURL && response.data.AbstractText) {
        results.push(new SearchResult(
          response.data.AbstractURL,
          response.data.AbstractTitle || response.data.Heading,
          response.data.AbstractText
        ));
      }
      
      // Add regular results
      if (response.data.Results) {
        response.data.Results.forEach(result => {
          if (results.length < num_results) {
            results.push(new SearchResult(
              result.FirstURL,
              result.Text,
              result.Text // DuckDuckGo API doesn't always provide descriptions
            ));
          }
        });
      }
      
      // Add related topics
      if (response.data.RelatedTopics) {
        response.data.RelatedTopics.forEach(topic => {
          // Skip topics that are categories
          if (topic.Topics) return;
          
          if (results.length < num_results && topic.FirstURL) {
            results.push(new SearchResult(
              topic.FirstURL,
              topic.Text,
              topic.Text.split(' - ')[1] || topic.Text // Try to extract description
            ));
          }
        });
      }
      
      return results.slice(0, num_results);
    } catch (error) {
      if (error.response?.status === 429 || error.response?.status === 503) {
        // Rate limited or service unavailable - apply exponential backoff
        if (retryCount < maxRetries) {
          const delay = baseRetryDelay * Math.pow(2, retryCount);
          logger.warn(`DuckDuckGo search rate limited, retrying in ${delay}ms (${retryCount + 1}/${maxRetries})`, {
            status: error.response?.status,
            statusText: error.response?.statusText
          });
          await wait(delay);
          retryCount++;
          continue;
        }
      }
      
      logger.error("DuckDuckGo search error", { error: error.message });
      throw new Error(`DuckDuckGo search error: ${error.message}`);
    }
  }
  
  // This should not be reached due to the while loop condition
  return [];
}
