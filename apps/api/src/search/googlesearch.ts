import axios from "axios";
import { JSDOM } from 'jsdom';
import { SearchResult } from "../../src/lib/entities";
import { logger } from "../../src/lib/logger";
import https from 'https';

const getRandomInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

// Helper function for implementing exponential backoff
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function get_useragent(): string {
    const lynx_version = `Lynx/${getRandomInt(2, 3)}.${getRandomInt(8, 9)}.${getRandomInt(0, 2)}`;
    const libwww_version = `libwww-FM/${getRandomInt(2, 3)}.${getRandomInt(13, 15)}`;
    const ssl_mm_version = `SSL-MM/${getRandomInt(1, 2)}.${getRandomInt(3, 5)}`;
    const openssl_version = `OpenSSL/${getRandomInt(1, 3)}.${getRandomInt(0, 4)}.${getRandomInt(0, 9)}`;
    return `${lynx_version} ${libwww_version} ${ssl_mm_version} ${openssl_version}`;
}

async function _req(
  term: string,
  results: number,
  lang: string,
  country: string,
  start: number,
  proxies: any,
  timeout: number,
  tbs: string | undefined = undefined,
  filter: string | undefined = undefined,
) {
  const params = {
    q: term,
    num: results+2, // Number of results to return
    hl: lang,
    gl: country,
    safe: "active",
    start: start,
  };
  if (tbs) {
    params["tbs"] = tbs;
  }
  if (filter) {
    params["filter"] = filter;
  }
  var agent = get_useragent();
  
  let retryCount = 0;
  const maxRetries = 3;
  const baseRetryDelay = 1000; // 1 second base delay
  
  while (retryCount <= maxRetries) {
    try {
      const resp = await axios.get("https://www.google.com/search", {
        headers: {
          "User-Agent": agent,
          "Accept": "*/*"
        },
        params: params,
        proxy: proxies,
        timeout: timeout,
        httpsAgent: new https.Agent({
          rejectUnauthorized: true 
        }),
        withCredentials: true
      });
      return resp;
    } catch (error) {
      if (error.response && error.response.status === 429) {
        if (retryCount < maxRetries) {
          const delay = baseRetryDelay * Math.pow(2, retryCount);
          logger.warn(`Google Search: Too many requests, retrying in ${delay}ms (${retryCount + 1}/${maxRetries})`, {
            status: error.response.status,
            statusText: error.response.statusText
          });
          await wait(delay);
          retryCount++;
          continue;
        }
        
        logger.warn("Google Search: Too many requests, max retries exceeded", {
          status: error.response.status,
          statusText: error.response.statusText,
          retries: retryCount
        });
        throw new Error("Google Search: Too many requests, try again later.");
      }
      throw error;
    }
  }
  
  // This should not be reached due to the while loop condition
  return null;
}

export async function googleSearch(
  term: string,
  advanced = false,
  num_results = 7,
  tbs = undefined as string | undefined,
  filter = undefined as string | undefined,
  lang = "en",
  country = "us",
  proxy = undefined as string | undefined,
  sleep_interval = 2, // Increased default from 0 to 2 seconds
  timeout = 5000,
): Promise<SearchResult[]> {
  let proxies: any = null;
  if (proxy) {
    if (proxy.startsWith("https")) {
      proxies = { https: proxy };
    } else {
      proxies = { http: proxy };
    }
  }

  // TODO: knowledge graph, answer box, etc.

  let start = 0;
  let results: SearchResult[] = [];
  let attempts = 0;
  const maxAttempts = 20; // Define a maximum number of attempts to prevent infinite loop
  while (start < num_results && attempts < maxAttempts) {
    try {
      const resp = await _req(
        term,
        num_results - start,
        lang,
        country,
        start,
        proxies,
        timeout,
        tbs,
        filter,
      );
      
      // Add null check for resp to fix TypeScript error
      if (!resp) {
        logger.warn("Failed to get search results, moving to next attempt");
        start += 1;
        attempts += 1;
        continue;
      }
      
      const dom = new JSDOM(resp.data);
      const document = dom.window.document;
      const result_block = document.querySelectorAll("div.ezO2md");
      let new_results = 0;
      let unique = true;
      let fetched_results = 0;

      const fetched_links = new Set<string>();
      if (result_block.length === 0) {
        start += 1;
        attempts += 1;
      } else {
        attempts = 0;
      }

      for (const result of result_block) {
          const link_tag = result.querySelector("a[href]") as HTMLAnchorElement;
          const title_tag = link_tag ? link_tag.querySelector("span.CVA68e") : null;
          const description_tag = result.querySelector("span.FrIlee");

          if (link_tag && title_tag && description_tag) {
              const link = decodeURIComponent(link_tag.href.split("&")[0].replace("/url?q=", ""));
              if (fetched_links.has(link) && unique) continue;
              fetched_links.add(link);
              const title = title_tag.textContent || "";
              const description = description_tag.textContent || "";
              fetched_results++;
              new_results++;
              if (link && title && description) {
                start += 1
                  results.push(new SearchResult(link, title, description));
              }
              if (fetched_results >= num_results) break;
          }
      }

      await new Promise((resolve) =>
        setTimeout(resolve, sleep_interval * 1000),
      );
    } catch (error) {
      if (error.message === "Too many requests") {
        logger.warn("Too many requests, breaking the loop");
        break;
      }
      throw error;
    }

    if (start === 0) {
      return results;
    }
  }
  if (attempts >= maxAttempts) {
    logger.warn("Max attempts reached, breaking the loop");
  }
  return results;
}
