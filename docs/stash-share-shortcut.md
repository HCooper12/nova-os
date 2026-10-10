# Stash in Nova: the share-sheet Shortcut

In Safari, tap Share, then **Stash in Nova**. The link goes to your Mac, lands
on the shelf its site already lives on (or on **Unsorted** for a site Nova has
not seen), and a banner says where: "Stashed on Skincare", or "Already on
Skincare" when the link is saved already. In Nova the new card sits first on
its shelf with a teal ring and "From Safari" for the rest of the day, and its
Undo is in the Inbox like every other Stash change.

An installed web app cannot appear in the iOS share sheet, so this is a
Shortcut. It posts to the same server the Stash's add bar uses. Build it once,
about five minutes.

**You need two values. Keep both private and never paste them anywhere public:**

- `BASE`: your Mac's **tailnet IP**, with the port, for example
  `http://100.x.y.z:4173`. Use the 100.x address from the Tailscale app on
  your phone, not the `ts.net` name: Shortcuts has failed to reach the
  `ts.net` name while Safari could (design/SIRI-SETUP.md has the history).
  Plain `http` is fine here; Tailscale already encrypts the line.
- `TOKEN`: the API token, from Nova's Settings (or `server/.env` on the Mac).

---

## Build it

In the Shortcuts app, tap **+** to make a new Shortcut and name it
**Stash in Nova**.

1. Tap the **ⓘ** at the bottom. Turn on **Show in Share Sheet**. Under
   **Share Sheet Types**, leave only **URLs** and **Safari web pages** on.
2. Add the action **Get URLs from Input**. Its input is **Shortcut Input**.
3. Add **Get Item from List**: **First Item** from **URLs**.
4. Add **Get Details of Safari Web Page**: **Name** of **Shortcut Input**.
   This is the page's title. It is optional: if it comes back empty, Nova
   reads the page's own name instead.
5. Add **Get Contents of URL**, and set it up like this:
   - URL: `BASE/api/stash/share` (your tailnet IP and port, then
     `/api/stash/share`)
   - Method: **POST**
   - Headers: add one header, as two separate fields:
     - Key: `Authorization`
     - Value: `Bearer ` followed by your token (the word Bearer, one space,
       then the token; no colon anywhere)
   - Request Body: **JSON**, with two fields:
     - Key `url`, Type **Text**, Value: the blue **Item from List** chip
       from step 3
     - Key `name`, Type **Text**, Value: the blue **Name** chip from step 4
6. Add **Get Dictionary Value**: Value for key `text` in **Contents of URL**.
7. Add **Show Notification** with the **Dictionary Value** chip.

Tap the values in steps 5 and 6 to make sure each is a **blue variable chip**,
not typed words. A typed "Item from List" sends those words, and Nova will
answer that it needs a web link.

## Try it

Open any product page in Safari, tap Share, scroll the row of actions to
**Stash in Nova** (you can move it to the front with **Edit Actions**). The
banner should say where it went. Open Nova's Stash: the card is first on its
shelf.

## What Nova does with it, exactly

- It refuses anything that is not an `http` or `https` link, in words.
- It checks for the same link already on a shelf, after stripping tracking
  tags (utm_, fbclid, igshid and the like), `www.`, a trailing slash and the
  `#` part. A link you already have is never saved twice; the banner says
  which shelf it is on.
- It picks the shelf by the site: the shelf with the most links from that
  site already, else **Unsorted**.
- It writes one line to `Wiki/Library/Stash.md` and files a record in the
  Inbox whose Undo takes the line back out.
- It reads the page once afterwards for its picture, through the Stash's one
  polite queue. A site that refuses the read, or asks for a bot check, is
  left alone: the card shows the shelf's monogram instead.

## When it does not work

Read `~/Library/Logs/nova-os-server.log` on the Mac first.

- **"unauthorized"**: the token is wrong, or the header was pasted as one
  line with a colon. The Key must be `Authorization` alone; the Value must
  start with `Bearer `.
- **Nothing arrives, no error**: the phone cannot reach the Mac. Check that
  Tailscale is on, that the URL uses the 100.x IP, and that the Mac is awake
  and plugged in.
- **"Nova needs a web link"**: the `url` field is typed text, not the blue
  chip from step 3.
