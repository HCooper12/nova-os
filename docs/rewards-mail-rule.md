# Rewards offers from your emails: the Mail rule

Nova shows your Everyday Rewards and Flybuys offers on the Shopping screen
(Points this week). It has no mail reader and never signs in to anything.
Instead, a rule in Mail on your Mac saves each rewards email into a folder in
your vault, and Nova reads that folder every 30 minutes.

What Nova does with a saved email:

- Code reads it first: the programme, each offer's multiplier ("10x points")
  or points total ("1,000 bonus points"), what it is on, its end date, and
  whether you have to Boost or Activate it.
- Only an email code cannot read goes to a model (the "Rewards email offers"
  lane in Settings, Haiku by default). Every figure the model gives must
  appear in the email's own words, or the offer is refused.
- An offer without an end date is never shown. Offers leave the morning
  after they end.
- Nova never follows an email's Boost or Activate link, because that would
  act on your account. The offer sheet says "activate it in the app" and
  takes your word when you tap "I activated it".
- The emails stay in your vault, never in the repo.

The folder is `Inbox/Rewards Mail/` inside your vault. Nova creates it the
first time it looks.

---

## Setting it up (about five minutes, once)

### 1. Mail needs your email account

Mail rules only run on mail that Apple Mail on this Mac receives. If your
Everyday Rewards and Flybuys emails go to Outlook, add that account to Mail:
**Mail → Settings → Accounts → +** and sign in. Mail must be open (it can sit
in the background) for the rule to run on new mail.

### 2. Save the script

Open **Script Editor** (in Applications → Utilities), make a new document,
and paste the script below. Change the one line marked `CHANGE THIS` to your
vault's folder (the same path as `VAULT_PATH` in Nova's `server/.env`).

Then **File → Save**, choose the format **Script**, and save it as
`Save rewards email for Nova.scpt` in this folder:

```
~/Library/Application Scripts/com.apple.mail/
```

(In the save dialog press Cmd+Shift+G and paste that path. Mail can only run
scripts that live there.)

```applescript
-- Save rewards email for Nova
-- Saves each message the rule passes in as a raw .eml file in the vault's
-- Inbox/Rewards Mail folder, where Nova reads it. Nothing else is touched:
-- no link is opened and no message is moved or deleted.

using terms from application "Mail"
	on perform mail action with messages theMessages for rule theRule
		-- CHANGE THIS to your vault's folder (VAULT_PATH in server/.env)
		set vaultPath to "/Users/YOU/path/to/your vault"

		set saveFolder to vaultPath & "/Inbox/Rewards Mail/"
		do shell script "mkdir -p " & quoted form of saveFolder
		repeat with eachMessage in theMessages
			try
				set theSource to source of eachMessage
				set theId to message id of eachMessage
				-- a short, stable file name from the message id, so saving the
				-- same email twice overwrites rather than duplicates it
				set shortId to do shell script "printf %s " & quoted form of theId & " | shasum | cut -c1-16"
				set stamp to do shell script "date +%Y-%m-%d"
				set filePath to saveFolder & stamp & "-" & shortId & ".eml"
				set fileRef to open for access (POSIX file filePath) with write permission
				set eof of fileRef to 0
				write theSource to fileRef as «class utf8»
				close access fileRef
			on error errMsg
				try
					close access fileRef
				end try
				log "Nova rewards rule: " & errMsg
			end try
		end repeat
	end perform mail action with messages
end using terms from
```

### 3. Make the rule

**Mail → Settings → Rules → Add Rule**, then:

- Description: `Rewards offers for Nova`
- If **any** of the following conditions are met:
  - **From** · contains · `everyday`
  - **From** · contains · `flybuys`
  - **From** · contains · `woolworths`
- Perform the following actions:
  - **Run AppleScript** · choose `Save rewards email for Nova`

Click OK. When Mail asks "Do you want to apply your rules to messages in
selected mailboxes?", choose **Don't Apply** for now.

Open one real Everyday Rewards email and one Flybuys email and check the
sender's address contains one of those words. If a sender uses a different
address, add a condition for it.

### 4. Try it on one email

Select one recent Everyday Rewards email in Mail, then **Message → Apply
Rules**. A file named like `2026-10-10-1a2b3c4d5e6f7a8b.eml` should appear in
your vault's `Inbox/Rewards Mail/`. Within 30 minutes (or when you next open
Shopping), Points this week shows its offers, and "Where offers come from" in
the ⋯ menu says when the last email arrived.

You can apply the rule to older offer emails the same way; an offer that has
already ended is read and left out.

---

## If something does not show

- **Nothing in the folder**: Mail is not running, the rule's conditions do
  not match the sender, or the script is not in
  `~/Library/Application Scripts/com.apple.mail/`. Script Editor's log
  shows the rule's error line if the save failed.
- **A file in the folder but no offer**: Nova could not read an offer with a
  figure and an end date from it. "Where offers come from" lists how many
  emails were read and how many offers were kept.
- **An offer at Kmart, Target, BWS or another partner**: left out on
  purpose. Points this week shows Woolworths and Coles offers only, because
  they are the ones your shopping list can use.

## Screenshots of the apps

Sending a screenshot of the Everyday Rewards or Flybuys app to Nova is not
built yet: Send to Nova takes text and links only, and a photo sent on
Telegram is read as food. It is the next door to add.
