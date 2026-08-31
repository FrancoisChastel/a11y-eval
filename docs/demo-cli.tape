# VHS tape — a11y-eval CLI demo (renders docs/demo-cli.gif)
Output docs/demo-cli.gif

Set Shell "bash"
Set FontFamily "Monaco"
Set FontSize 16
Set LetterSpacing 0
Set LineHeight 1.2
Set Width 1300
Set Height 900
Set Padding 28
Set Theme "Catppuccin Macchiato"
Set WindowBar Colorful
Set WindowBarSize 36
Set TypingSpeed 40ms
Set PlaybackSpeed 1.0

Hide
Type "clear"
Enter
Show

Type "# Evaluate a site: crawl from one seed, run axe + keyboard/focus/reflow checks"
Enter
Sleep 1.2s
Type "node src/cli.ts --url test-fixtures/site/index.html --crawl --out demo-report"
Enter
Sleep 14s

Type "# Everything an agent or a human needs, generated per run:"
Enter
Sleep 1s
Type "ls demo-report/"
Enter
Sleep 4.5s
