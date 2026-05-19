# Sagent

Sagent is a polished Expo + React Native message manager for saving text you reuse often, organizing it into categories, and sending it quickly.

It is built for a clean mobile-first experience with local storage, optional app lock, favorites, Premium upgrade boilerplate, and a custom floating tab bar UI.

## Features

- Save, edit, delete, search, and favorite reusable messages
- Organize messages with six default categories: Sales, Support, Finance, Marketing, Operations, and Other
- Share saved messages from the full card surface
- Copy messages silently with the clipboard icon
- Free tier includes 50 shared messages per month with monthly reset
- Premium boilerplate with unlimited folders and messages
- Local-first SQLite persistence
- Expo + React Native + TypeScript

## Project Structure

```text
src/
|-- components/
|-- constants/
|-- hooks/
|   |-- useSnippets.tsx
|-- navigation/
|-- screens/
|   |-- AddSnippetScreen.tsx
|-- services/
|-- types/
|-- utils/
```

## App Identity

- App name: `Sagent`
- Expo slug: `sagent`
- Android package: `com.sagent.app`
- iOS bundle identifier: `com.sagent.app`

## Storage

Messages, categories, preferences, onboarding flags, and free-tier share counters are stored locally with SQLite.

## Premium

Sagent includes local Premium state and native billing integration hooks for:

- Save hours every week
- Unlimited messages
- No watermark on shared messages
- Monthly price: `$9.99`
- Yearly price: `$89.99` with 25% discount
