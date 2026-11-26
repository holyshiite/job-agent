# Job companion backend

The companion on GitHub Pages uses this Cloudflare Worker. Its API key and private access token are runtime secrets. Only give the access token to intended users.

From this directory, sign in to Wrangler and deploy to an existing Cloudflare account.

```sh
npx wrangler login
npx wrangler deploy
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put CHAT_ACCESS_TOKEN
```

Use an OpenAI API key with access to the configured model and an independently generated, high-entropy token for `CHAT_ACCESS_TOKEN`. Never commit either secret. Set `OPENAI_MODEL` in `wrangler.toml` if your API project needs a different model.

In the dashboard, open **Job companion**, then **Connect**, and enter the deployment URL ending in `/chat` and the private access token. The URL is remembered in the browser and the token remains in memory for the current page. GitHub Pages does not run this Worker.

The Worker defaults to the GitHub Pages origin, rate-limits requests, and calls the OpenAI Responses API with `store:false`. The selected job and résumé text are sent only according to the chat controls. Clearing the chat removes its in-memory conversation.
