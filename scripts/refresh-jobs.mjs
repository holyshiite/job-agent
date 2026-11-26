import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { feeds, loadFeed } from '../job-feeds.mjs';
const output = new URL('../data/jobs.json', import.meta.url);
let prior = {};
try { prior = JSON.parse(await readFile(output, 'utf8')).sources || {}; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const sources = {};
const results = await Promise.allSettled(Object.entries(feeds).map(async ([name, config]) => {
  const jobs = await loadFeed(name, config);
  const unique = [...new Map(jobs.map(job => [job.url, job])).values()];
  return [name,{refreshedAt:new Date().toISOString(),via:'API',jobs:unique}];
}));
for (const [index, result] of results.entries()) {
  const name = Object.keys(feeds)[index];
  if (result.status === 'fulfilled') { sources[name] = result.value[1]; continue; }
  if (prior[name]) sources[name] = prior[name];
  console.warn(name + ': ' + result.reason.message);
}
if (results.every(result => result.status === 'rejected')) throw Error('All job feeds were unavailable; keeping the previous snapshot');
await mkdir(new URL('../data/', import.meta.url), {recursive:true});
await writeFile(output, JSON.stringify({sources})+'\n');
console.log(Object.entries(sources).map(([name, data]) => name + ': ' + data.jobs.length).join(', '));
