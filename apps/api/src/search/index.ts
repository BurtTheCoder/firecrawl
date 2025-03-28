import { logger } from "../../src/lib/logger";
import { SearchResult } from "../../src/lib/entities";
import { googleSearch } from "./googlesearch";
import { searchapi_search } from "./searchapi";
import { serper_search } from "./serper";
import { searxng_search } from "./searxng";
import { braveSearch } from "./bravesearch";
import { duckduckgoSearch } from "./duckduckgo";

// Search provider tracking for load balancing and fallback strategy
let lastProvider = "";
let googleFailCount = 0;
const MAX_GOOGLE_FAILURES = 5;
const GOOGLE_FAILURE_RESET_TIME = 30 * 60 * 1000; // 30 minutes
let lastGoogleFailure = 0;

// Helper function to select the best available search provider
function selectSearchProvider() {
  // Reset Google failure count if it's been long enough since the last failure
  if (googleFailCount > 0 && (Date.now() - lastGoogleFailure) > GOOGLE_FAILURE_RESET_TIME) {
    googleFailCount = 0;
    logger.info("Reset Google failure count after cooling period");
  }
  
  // Check which API keys are available
  const hasSerper = !!process.env.SERPER_API_KEY;
  const hasSearchAPI = !!process.env.SEARCHAPI_API_KEY;
  const hasSearxNG = !!process.env.SEARXNG_ENDPOINT;
  const hasBraveSearch = !!process.env.BRAVE_SEARCH_API_KEY;
  const hasDuckDuckGo = !!process.env.DUCKDUCKGO_ENABLED;
  
  // If Google has failed too many times recently, prefer any available API
  if (googleFailCount >= MAX_GOOGLE_FAILURES) {
    if (hasSerper) return "serper";
    if (hasSearchAPI) return "searchapi";
    if (hasSearxNG) return "searxng";
    if (hasBraveSearch) return "brave";
    if (hasDuckDuckGo) return "duckduckgo";
    
    // If we have no alternatives, reset the failure count and try Google again
    logger.warn("No alternative search providers available despite Google failures. Resetting failure count.");
    googleFailCount = 0;
    return "google";
  }
  
  // If we have any API keys, prioritize them over Google
  if (hasSerper) return "serper";
  if (hasSearchAPI) return "searchapi";
  if (hasSearxNG) return "searxng";
  if (hasBraveSearch) return "brave";
  if (hasDuckDuckGo) return "duckduckgo";
  
  // Fall back to Google
  return "google";
}

export async function search({
  query,
  advanced = false,
  num_results = 5,
  tbs = undefined,
  filter = undefined,
  lang = "en",
  country = "us",
  location = undefined,
  proxy = undefined,
  sleep_interval = 2, // Default to 2 seconds to avoid rate limiting
  timeout = 5000,
}: {
  query: string;
  advanced?: boolean;
  num_results?: number;
  tbs?: string;
  filter?: string;
  lang?: string;
  country?: string;
  location?: string;
  proxy?: string;
  sleep_interval?: number;
  timeout?: number;
}): Promise<SearchResult[]> {
  try {
    // Select the best search provider based on availability and previous performance
    const provider = selectSearchProvider();
    lastProvider = provider;
    
    logger.info(`Using search provider: ${provider}`);
    
    switch (provider) {
      case "serper":
        return await serper_search(query, {
          num_results,
          tbs,
          filter,
          lang,
          country,
          location,
        });
        
      case "searchapi":
        return await searchapi_search(query, {
          num_results,
          tbs,
          filter,
          lang,
          country,
          location,
        });
        
      case "searxng":
        return await searxng_search(query, {
          num_results,
          tbs,
          filter,
          lang,
          country,
          location,
        });
        
      case "brave":
        return await braveSearch(query, {
          num_results,
          lang,
          country,
          timeout,
        });
        
      case "duckduckgo":
        return await duckduckgoSearch(query, {
          num_results,
          region: country,
          timeout,
        });
        
      case "google":
      default:
        try {
          return await googleSearch(
            query,
            advanced,
            num_results,
            tbs,
            filter,
            lang,
            country,
            proxy,
            sleep_interval,
            timeout,
          );
        } catch (error) {
          // Track Google failures to potentially switch providers
          if (error.message && error.message.includes("Too many requests")) {
            googleFailCount++;
            lastGoogleFailure = Date.now();
            logger.warn(`Google search failed with rate limiting. Failure count: ${googleFailCount}`);
            
            // If we have alternatives, try them instead of failing
            if (process.env.BRAVE_SEARCH_API_KEY) {
              logger.info("Falling back to Brave Search after Google failure");
              return await braveSearch(query, { num_results, lang, country, timeout });
            }
            if (process.env.DUCKDUCKGO_ENABLED) {
              logger.info("Falling back to DuckDuckGo after Google failure");
              return await duckduckgoSearch(query, { num_results, region: country, timeout });
            }
            if (process.env.SERPER_API_KEY) {
              logger.info("Falling back to Serper after Google failure");
              return await serper_search(query, { num_results, tbs, filter, lang, country, location });
            }
            if (process.env.SEARCHAPI_API_KEY) {
              logger.info("Falling back to SearchAPI after Google failure");
              return await searchapi_search(query, { num_results, tbs, filter, lang, country, location });
            }
            if (process.env.SEARXNG_ENDPOINT) {
              logger.info("Falling back to SearxNG after Google failure");
              return await searxng_search(query, { num_results, tbs, filter, lang, country, location });
            }
          }
          throw error;
        }
    }
  } catch (error) {
    logger.error(`Error in search function with provider ${lastProvider}`, { error });
    return [];
  }
}
