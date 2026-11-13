# Tawakkul Trading website

A one-page static site: plain HTML, no build step. It is fully separate from the Abdi OS app in this repo and is deployed as its own Vercel project.

## 1. Add your links (2 minutes)

Open `index.html` and find the `EDIT YOUR LINKS HERE` block near the bottom. Paste in:

- `apply`: your application or booking form (Typeform, Calendly, and so on)
- `community`: your Whop checkout link for the $250/month community
- `instagram`, `youtube`: your profile URLs
- `email`: for example `mailto:hello@yourdomain.com`

Any link you leave empty scrolls to the Programs section (for buttons) or is hidden (for footer links).

To add a photo of Abdi, put `abdi.jpg` in this folder and replace the placeholder block marked in the About section with `<img src="abdi.jpg" alt="Abdi">`.

## 2. Deploy on Vercel (about 5 minutes)

1. Go to vercel.com → **Add New… → Project** → import the `703abdi/claude` repo.
2. Set **Root Directory** to `tawakkul-site`.
3. Set **Framework Preset** to **Other**. Leave the build command empty.
4. Click **Deploy**.

## 3. Connect your domain

1. In the new Vercel project, open **Settings → Domains** and add your domain, plus the `www.` version.
2. At your domain registrar (GoDaddy, Namecheap and so on), add the DNS records Vercel shows you. They are usually:
   - `A` record, host `@`, value `76.76.21.21`
   - `CNAME` record, host `www`, value `cname.vercel-dns.com`
3. Wait for the domain to verify. This usually takes a few minutes but can take up to a few hours. Vercel sets up HTTPS automatically.
