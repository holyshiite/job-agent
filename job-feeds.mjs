
export const sites = {
  "Apple": "https://jobs.apple.com/en-us/search",
  "Netflix": "https://explore.jobs.netflix.net/careers",
  "Google": "https://www.google.com/about/careers/applications/jobs/results/",
  "Meta": "https://www.metacareers.com/jobs",
  "Anthropic": "https://www.anthropic.com/careers/jobs",
  "OpenAI": "https://openai.com/careers/search/",
  "LinkedIn": "https://www.linkedin.com/jobs/",
  "Monster": "https://www.monster.com/jobs/",
  "Indeed": "https://www.indeed.com/",
  "Jack & Jill": "https://www.jackandjill.ai/jobs"
};
export const feeds = {
  "OpenAI": {
    "provider": "ashby",
    "board": "openai"
  },
  "Anthropic": {
    "provider": "greenhouse",
    "board": "anthropic"
  }
};
const hostProviders = {
  'jobs.ashbyhq.com':'ashby','api.ashbyhq.com':'ashby',
  'job-boards.greenhouse.io':'greenhouse','boards.greenhouse.io':'greenhouse','boards-api.greenhouse.io':'greenhouse',
  'jobs.lever.co':'lever','api.lever.co':'lever'
};
export function safeUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
}
export function identifyFeed(link) {
  if (!safeUrl(link)) return null;
  const url = new URL(link), provider = hostProviders[url.hostname];
  if (!provider) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  const board = (provider === 'ashby' && parts[0] === 'posting-api') ? parts[2]
    : (provider === 'greenhouse' && parts[0] === 'v1') ? parts[2]
    : (provider === 'lever' && parts[0] === 'v0') ? parts[2] : parts[0];
  return /^[a-z0-9_-]{2,80}$/i.test(board || '') ? {provider,board} : null;
}
const urls = {
  ashby: board => 'https://api.ashbyhq.com/posting-api/job-board/' + board,
  greenhouse: board => 'https://boards-api.greenhouse.io/v1/boards/' + board + '/jobs?content=true',
  lever: board => 'https://api.lever.co/v0/postings/' + board + '?mode=json'
};
export function plain(html) {
  return String(html || '').replace(/&(?:amp;)?(lt|gt|quot|nbsp|amp|#39|#x27);/gi,(_, ch) =>
    ({lt:'<',gt:'>',quot:'"',nbsp:' ',amp:'&','#39':"'",'#x27':"'"})[ch.toLowerCase()])
    .replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
}
export async function loadFeed(source, {provider,board}) {
  if (!Object.hasOwn(urls,provider) || !/^[a-z0-9_-]{2,80}$/i.test(board)) throw Error('Unsupported job feed');
  const endpoint = urls[provider](encodeURIComponent(board));
  const response = await fetch(endpoint,{signal:AbortSignal.timeout(12000)});
  if (!response.ok) throw Error('Feed returned HTTP ' + response.status);
  const json = await response.json(), items = provider === 'lever' ? json : json.jobs;
  if (!Array.isArray(items)) throw Error('Unexpected feed response');
  return items.flatMap(item => {
    if (item.isListed === false) return [];
    const title=item.title || item.text, url=safeUrl(item.jobUrl || item.absolute_url || item.hostedUrl);
    if (!title || !url) return [];
    const dateValue=item.publishedAt ?? item.first_published ?? item.createdAt;
    const updatedOnly=!dateValue && item.updated_at;
    const timestamp=dateValue ?? updatedOnly;
    const date=timestamp ? new Date(timestamp) : null;
    const posted=date && Number.isFinite(date.getTime()) ? date.toISOString() : '';
    const role=plain(item.descriptionPlain || item.description || item.content).slice(0,15000);
    return [{id:'feed:'+provider+':'+board+':'+encodeURIComponent(item.id??url),source,title,location:(typeof item.location==='string'?item.location:item.location?.name) || item.categories?.location || 'Location unavailable',posted,dateLabel:updatedOnly?'Updated':'Posted',url,role}];
  });
}

export async function inspectCareerPage(source, link, respond = fetch) {
  const url = safeUrl(link);
  if (!url) throw Error('Use a public HTTPS careers URL');
  const response = await respond(url,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw Error('Career page returned HTTP '+response.status);
  const html = (await response.text()).slice(0,2000000);
  const jobs = new Map();
  for(const match of html.matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)){
    let root;try{root=JSON.parse(match[1])}catch{continue}
    const stack=[root];
    while(stack.length){
      const item=stack.pop();
      if(!item||typeof item!=='object')continue;
      for(const value of Object.values(item))if(value&&typeof value==='object')stack.push(value);
      if(![item['@type']].flat().includes('JobPosting')||typeof item.title!=='string')continue;
      if(item.validThrough&&Date.parse(item.validThrough)<Date.now())continue;
      let jobUrl;try{jobUrl=safeUrl(new URL(item.url||item.mainEntityOfPage?.['@id']||url,url).href)}catch{continue}
      if(!jobUrl)continue;
      const date=Date.parse(item.datePosted);
      const locations=[item.jobLocation].flat().filter(Boolean).map(x=>[x.address?.addressLocality,x.address?.addressRegion,x.address?.addressCountry].filter(y=>typeof y==='string').join(', ')).filter(Boolean);
      jobs.set(jobUrl,{id:'feed:page:'+encodeURIComponent(jobUrl),source,title:item.title,url:jobUrl,role:plain(item.description).slice(0,15000),location:locations.join(' / ')|| (item.jobLocationType==='TELECOMMUTE'?'Remote':'Location unavailable'),posted:Number.isFinite(date)?new Date(date).toISOString():'',dateLabel:'Posted'});
    }
  }
  if(!jobs.size)throw Error('No structured job listings found');
  return [...jobs.values()];
}
