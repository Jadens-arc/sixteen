import type { NextConfig } from "next";

/**
 * Every page here is dynamic, and Next streams metadata for a dynamic page:
 * the <title>, the description, the Open Graph tags and the JSON-LD arrive
 * after </head> has already been sent, and the browser hoists them. A client
 * that only parses the raw HTML - which is most answer-engine crawlers and
 * every link unfurler - sees a page with no title at all.
 *
 * Listing a user agent here makes Next do a blocking render for it and put the
 * metadata back in <head> where those parsers look. The cost is that the bot
 * waits for the database read; a crawler will, and a person's browser is
 * unaffected.
 *
 * The first half of this pattern mirrors Next's own default list (Next 15.5);
 * the second half is the AI and answer-engine crawlers, which the default does
 * not cover and which are the whole point of the exercise. Googlebot is
 * deliberately absent from both: it executes JavaScript and reads the hoisted
 * tags fine.
 */
const HTML_LIMITED_BOTS =
  /[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight|GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|Claude-User|Claude-SearchBot|Anthropic-AI|PerplexityBot|Perplexity-User|Amazonbot|Bytespider|CCBot|cohere-ai|Diffbot|DuckAssistBot|meta-externalagent|MistralAI-User|YouBot/i;

const nextConfig: NextConfig = {
  htmlLimitedBots: HTML_LIMITED_BOTS,
};

export default nextConfig;
