# Turtle Yard – Google Play listing kit

Everything here is ready to paste into the Play Console. Files are in this `store/` folder.

## Files
| Play Console field | File |
|---|---|
| App bundle (upload to a release) | `android/app/build/outputs/bundle/release/app-release.aab` (rebuild with the command at the bottom) |
| App icon (512×512) | `store/play-icon-512.png` |
| Feature graphic (1024×500) | `store/feature-graphic-1024x500.png` |
| Phone screenshots (1080×2160) | `store/screenshot-overview.png`, `screenshot-rare.png`, `screenshot-family.png`, `screenshot-book.png`, `screenshot-shop.png`, `screenshot-paint.png`, `screenshot-night.png` |
| Privacy policy URL | https://madgetr.github.io/turtles/privacy.html (live once this commit is pushed) |

Suggested screenshot order: overview → rare → paint → book → shop → night → family.

## App details
- **App name** (max 30): `Turtle Yard`
- **Package name** (permanent): `com.madgetr.petturtle`
- **Category**: Games → Simulation (or Casual)
- **Tags**: Pet, Simulation, Casual, Building, Animals
- **Contact email**: your developer email (shown publicly on the listing)
- **Website** (optional): https://madgetr.github.io/turtles/

### Short description (max 80 characters)
```
Raise a family of pet turtles, find treasures and build your dream turtle yard!
```

### Full description (max 4000 characters)
```
Welcome to Turtle Yard, a cozy pet game where you raise a whole family of turtles and build them the yard of their dreams! 🐢

🐢 RAISE YOUR TURTLES
Every hatchling has its own name, colors and personality: speedy or slow, cuddly or grumpy, playful or lazy. Feed them lettuce and berries, give them fresh water, scoop up their messes and play ball. Watch them grow from tiny hatchlings into big adults over a whole month.

✨ RARE TURTLES
Some hatchlings are special! Look out for spotted, striped and spiky shells, red and blue-grey turtles, super rare albinos and legendary golden turtles.

💚 LITTLE PERSONALITIES
Turtles get lonely, sleepy and chilly. They nap in the shade, cuddle up in the moss bed, bask on warm rocks, swim in the pond and climb the giant lookout rock. Pet them and they show you how happy they are.

🏡 BUILD YOUR YARD
Paint the ground with grass, flower meadows, stone paths, boardwalks and your own ponds. Add huts, caves, slides, rocks, trees, a fog machine and more. Build up to five yards, like a busy playground yard and a quiet retirement yard, and move turtles between them.

🦋 WILDLIFE
Plant butterfly bushes, hang a bird feeder, add lily pads for frogs and build a bug hotel. The yard comes alive!

💎 TREASURES & COLLECTING
Sparkly treasures turn up in the yard every few hours. Collect 30 finds with fun facts in your collection book. Finish a set to earn a special decoration with a magic power, like Tidy Tide, which cleans the whole yard in one tap.

🎁 SOMETHING NEW EVERY DAY
A mystery gift and three little jobs wait for you each day. Miss a day? No problem: nothing is ever lost.

👨‍👩‍👧 MADE FOR KIDS AND FAMILIES
• No ads
• No in-app purchases
• No accounts or sign-ins
• Your game stays on your device. Visit friends' yards only when they say yes, with no chat
• Turtles can't die while you're away

Gentle sounds, cozy day and night, and a yard that keeps growing with you. Start your turtle family today!
```

## Policy & content forms (Play Console → App content)
- **Privacy policy**: https://madgetr.github.io/turtles/privacy.html
- **Ads**: No, the app does not contain ads.
- **App access**: All functionality is available without special access.
- **Content rating** (IARC questionnaire): category *Game*. Answer **No** to violence, fear, sexuality, language, controlled substances and gambling. Once the Friends feature is switched on (relay deployed), answer **Yes** to users interacting / sharing content: players can see each other's yards and turtle names. There is no chat. Expected rating: Everyone / PEGI 3, with a "Users Interact" notice.
  - One honest note: a turtle can die if it's badly neglected while the game is open (a sad message, no gore). This is mild and fits "Everyone".
- **Target audience and content**: select age groups **5 and under, 6–8, 9–12** (and 13+ if you want teens/adults too). Choosing under-13 groups puts the app in the Families program, which the game already meets.
- **Data safety** (before the Friends feature is switched on): *Does your app collect or share any of the required user data types?* → **No**.
- **Data safety** (once the Friends relay is live; check these answers yourself against Google's current form):
  - Collects data: **Yes**. **Device or other IDs** (the random device code) and **Other user-generated content** (yard and turtle names in a visit or gift).
  - For each: collected, **not shared** (transfers a player starts to another player don't count as sharing), **processed ephemerally**, **optional** (only if you use Friends), purpose **App functionality**.
  - Encrypted in transit: **Yes** (wss://). Users can request deletion: nothing is stored, so not applicable. No accounts.
- **Government apps / financial features / health**: No.
- **News app**: No.

## Before the first release – things only you can do
1. **Create a Google Play developer account** at https://play.google.com/console (one-time $25 US fee) and finish identity verification.
2. **Personal accounts must run a closed test first**: Google requires at least **12 testers opted in for 14 days** before you can publish to production. Family and friends with Android phones count. Start this as early as you can.
3. **Create the app**: name *Turtle Yard*, type *Game*, *Free*, and accept the declarations.
4. **Let Google manage the app signing key** (Play App Signing, the default). The file you upload is signed with your **upload key**, kept in `C:\Users\trevo\turtle-release\`.
5. **Upload `app-release.aab`** to *Testing → Internal testing* first, install it from the Play Store link, then promote to the closed test.
6. Fill in the store listing and app content forms above, then send the release for review. Reviews for kids' apps can take several days.

## ⚠️ Keep the upload key safe
`C:\Users\trevo\turtle-release\upload-keystore.jks` and `keystore.properties` (its password) are **not** in git, on purpose.
Back up that folder somewhere safe (a USB stick or a password manager). Every future update must be signed with the same key.
If it's ever lost, Google can reset the upload key, but it takes a support request and some days.

## Rebuilding the bundle for a new version
1. Bump `versionCode` (must go up by 1 each upload) and `versionName` in `android/app/build.gradle`.
2. Then run:
```
npm run build && npx cap sync android && cd android && ./gradlew bundleRelease
```

## Moving your own save to the Play Store version
The Play Store version is signed by Google, so Android sees it as a different install from the one sideloaded on your Pixel.
Before installing it, the save needs moving (Claude did this once already by copying it over USB). An in-game backup and restore would make this easy for everyone; it's a good next feature.
