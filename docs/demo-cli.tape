# VHS tape — a11y-eval CLI demo (renders docs/demo-cli.gif)
Output docs/demo-cli.gif

Set Shell "bash"
Set FontFamily "Monaco"
Set FontSize 16
Set LetterSpacing 0
Set LineHeight 1.2
Set Width 1300
Set Height 780
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

Type "# Root-cause remediation plan, ordered by impact"
Enter
Sleep 1s
Type "grep -A 2 'Recommended fixes' demo-report/report.md | head -8"
Enter
Sleep 3.5s

Type "# The manual-review UI ships with every report"
Enter
Sleep 1s
Type "ls demo-report/"
Enter
Sleep 4s
