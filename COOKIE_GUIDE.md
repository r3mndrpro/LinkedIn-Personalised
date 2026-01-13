# How to Get Your LinkedIn Session Cookie

## Why Use Cookies Instead of Email/Password?

Using session cookies (`li_at`) is **the professional way** to automate LinkedIn. This is exactly what tools like Phantombuster, Apify scrapers, and other professional services use.

### Benefits:

✅ **Bypasses 2FA** - Cookie is already authenticated
✅ **More secure** - No password stored anywhere
✅ **More reliable** - No login flow to fail
✅ **Faster** - Skip entire login process
✅ **Less detectable** - No repeated login patterns
✅ **Industry standard** - What the pros use

## Step-by-Step Guide

### 1. Login to LinkedIn

Open Chrome (or any Chromium browser) and login to LinkedIn normally:
- Go to https://www.linkedin.com
- Login with your email/password
- Complete any 2FA if prompted

### 2. Open DevTools

Press **F12** (or right-click → Inspect)

### 3. Navigate to Cookies

1. Click the **Application** tab at the top
2. In the left sidebar, expand **Cookies**
3. Click on **https://www.linkedin.com**

### 4. Find the `li_at` Cookie

Look for the cookie named **`li_at`** in the list (they're alphabetical, so scroll down to "L")

### 5. Copy the Value

1. Click on the `li_at` row
2. Look at the **Value** field at the bottom
3. Double-click to select all
4. Copy it (**Ctrl+C** / **Cmd+C**)

The value will look something like this:
```
AQEDATg4NzE1OTE2NTg5NjU3Njk1NjE2NTE2NTg5NjU3Njk1NjE2NTE2NTg5NjU3Njk1NjE2NTE2NTg5NjU3Njk1NjE2...
```

It's typically **150-250 characters long**.

### 6. Use the Cookie

Paste this value into:
- Apify input field: **LinkedIn Session Cookie (li_at)**
- Or your `.env` file: `LINKEDIN_SESSION_COOKIE=your-cookie-value`

## Important Notes

### Cookie Expiration
- LinkedIn session cookies typically last **1-2 months**
- You'll need to get a fresh cookie when it expires
- Actor will fail with "not authenticated" if cookie is expired

### Security
- **Never share this cookie publicly** - it's like a password
- Store it securely in Apify (it's marked as secret)
- Don't commit it to Git

### Multiple Accounts
- Each LinkedIn account has its own `li_at` cookie
- To switch accounts, just get the cookie from a different logged-in session

### Troubleshooting

**"Can't find the li_at cookie"**
- Make sure you're logged into LinkedIn first
- Try refreshing the page and checking again
- Some browser extensions might interfere - try in Incognito mode

**"Cookie not working"**
- Make sure you copied the **entire value** (no spaces at beginning/end)
- Try logging out of LinkedIn, logging back in, and getting a fresh cookie
- Check that your LinkedIn account isn't restricted

**"Session expired"**
- Normal behavior after 1-2 months
- Just get a new cookie following the same steps

## Alternative Methods

### Using Browser Extensions

You can use extensions like:
- **EditThisCookie** (Chrome)
- **Cookie-Editor** (Firefox/Chrome)

These make it easier to export cookies, but the manual method above is simplest.

### Using JavaScript Console

You can also get the cookie via the Console tab:

```javascript
document.cookie.split('; ').find(row => row.startsWith('li_at=')).split('=')[1]
```

This will output just the cookie value.

## FAQ

**Q: Is this safe?**
A: Yes, this is the standard method used by professional scraping tools. Just keep your cookie private.

**Q: Will LinkedIn detect this?**
A: Cookie authentication is LESS detectable than automated login. It looks like a normal session.

**Q: How often do I need to update it?**
A: Every 1-2 months when the cookie expires.

**Q: Can I use this on multiple machines?**
A: Yes! The same cookie works anywhere. That's why it's perfect for cloud automation.

**Q: What if I logout of LinkedIn?**
A: Your cookie will be invalidated. You'll need to login again and get a new cookie.

---

**Ready to go?** Get your cookie and paste it into the Apify actor input!
