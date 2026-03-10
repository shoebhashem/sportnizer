import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/**
 * Custom HTML template for the web app.
 *
 * Sets theme-color meta tags so mobile browser chrome (Android navigation bar,
 * iOS status bar & toolbar) matches the app's dark background (#25292e).
 *
 * Also sets viewport-fit=cover for proper iOS safe-area handling on web,
 * and a matching body background to prevent the white flash before JS loads.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        {/* Theme color for mobile browser chrome */}
        <meta name="theme-color" content="#25292e" />

        {/* iOS Safari: status bar and toolbar color when added to home screen */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />

        {/*
          Disable body scrolling on web. This is the default behavior in Expo
          for React Native web apps since the ScrollView component handles
          scrolling within the app.
        */}
        <ScrollViewStyleReset />

        {/* Set the body background to match the app theme so there's no white
            flash while JavaScript loads. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              body {
                background-color: #25292e;
              }
              /* Extend the app into iOS safe areas */
              @supports (padding: env(safe-area-inset-top)) {
                html {
                  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
                }
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
