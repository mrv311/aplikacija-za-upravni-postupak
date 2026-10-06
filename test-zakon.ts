import * as cheerio from 'cheerio';
async function run() {
  const url = 'https://www.zakon.hr/z/65/Zakon-o-op%C4%87em-upravnom-postupku';
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  const html = await response.text();
  const $ = cheerio.load(html);
  $('script, style, head, nav, footer, iframe, header, noscript').remove();
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  console.log("Extracted text length:", text.length);
  console.log("Sample:", text.substring(0, 500));
}
run();
