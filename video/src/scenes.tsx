import React from 'react'
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { TermLine, TerminalWindow, TermLines } from './Terminal'
import { theme } from './theme'

export const Scene: React.FC<{ kicker?: string; children: React.ReactNode }> = ({ kicker, children }) => {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill style={{ background: theme.bg, opacity, justifyContent: 'center' }}>
      {kicker ? (
        <div
          style={{
            position: 'absolute',
            top: 54,
            left: 80,
            color: theme.subtext,
            fontFamily: theme.sans,
            fontSize: 30,
            letterSpacing: 4,
            textTransform: 'uppercase',
          }}
        >
          {kicker}
        </div>
      ) : null}
      {children}
    </AbsoluteFill>
  )
}

export const TitleScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const pop = spring({ frame, fps, config: { damping: 14 } })
  return (
    <AbsoluteFill style={{ background: theme.bg, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ transform: `scale(${pop})`, textAlign: 'center' }}>
        <div style={{ fontFamily: theme.mono, fontSize: 130, fontWeight: 700, color: theme.text }}>
          a11y<span style={{ color: theme.blue }}>-eval</span>
        </div>
        <div style={{ fontFamily: theme.sans, fontSize: 44, color: theme.subtext, marginTop: 24 }}>
          WCAG 2.2 AA evaluation for repos &amp; running apps
        </div>
        <div style={{ fontFamily: theme.mono, fontSize: 30, color: theme.teal, marginTop: 34, opacity: interpolate(frame, [25, 45], [0, 1], { extrapolateRight: 'clamp' }) }}>
          axe-core · Playwright · agent skills — all open source
        </div>
      </div>
    </AbsoluteFill>
  )
}

export const TerminalScene: React.FC<{ kicker: string; title: string; lines: TermLine[] }> = ({ kicker, title, lines }) => (
  <Scene kicker={kicker}>
    <TerminalWindow title={title}>
      <TermLines lines={lines} />
    </TerminalWindow>
  </Scene>
)

const CardBox: React.FC<{ title: string; body: string; color: string; index: number }> = ({ title, body, color, index }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = spring({ frame: frame - 8 - index * 9, fps, config: { damping: 15 } })
  return (
    <div
      style={{
        width: 620,
        background: theme.card,
        border: `1px solid ${theme.border}`,
        borderTop: `6px solid ${color}`,
        borderRadius: 16,
        padding: '30px 34px',
        transform: `translateY(${(1 - enter) * 60}px)`,
        opacity: enter,
      }}
    >
      <div style={{ fontFamily: theme.mono, fontSize: 36, color, fontWeight: 700 }}>{title}</div>
      <div style={{ fontFamily: theme.sans, fontSize: 29, color: theme.subtext, marginTop: 14, lineHeight: 1.45 }}>{body}</div>
    </div>
  )
}

export const ArtifactsScene: React.FC = () => (
  <Scene kicker="Every run writes four artifacts">
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 36, justifyContent: 'center', maxWidth: 1420, margin: '0 auto' }}>
      <CardBox index={0} color={theme.blue} title="report.json" body="The stable machine contract: findings with selectors, WCAG mapping, score breakdown, signals, evidence packets." />
      <CardBox index={1} color={theme.teal} title="report.md" body="Human summary: at-a-glance table, top fixes, per-page findings — and a Gaps section stating what was NOT covered." />
      <CardBox index={2} color={theme.mauve} title="mitigations.md" body="An agent-executable work order: every instance to fix, steps, before/after examples, binding anti-fix pitfalls." />
      <CardBox index={3} color={theme.green} title="review.html" body="Self-contained UI for the manual half — suspects to confirm, collected evidence, one-click justified N/A." />
    </div>
  </Scene>
)

export const SuspectsScene: React.FC = () => {
  const frame = useCurrentFrame()
  const item = (text: string, color: string) => (
    <div style={{ fontFamily: theme.mono, fontSize: 27, color, marginTop: 12 }}>{text}</div>
  )
  return (
    <Scene kicker="Violations gate CI — suspects never break trust">
      <div style={{ display: 'flex', gap: 44, justifyContent: 'center' }}>
        <div style={{ width: 660, background: theme.card, borderRadius: 16, border: `2px solid ${theme.red}`, padding: 36 }}>
          <div style={{ fontFamily: theme.sans, fontSize: 38, fontWeight: 700, color: theme.red }}>Violations — certain</div>
          <div style={{ fontFamily: theme.sans, fontSize: 27, color: theme.subtext, marginTop: 8 }}>Gate the verdict · exit code 1 · block CI</div>
          {item('image-alt (1.1.1)', theme.text)}
          {item('keyboard-unreachable (2.1.1)', theme.text)}
          {item('on-focus-context-change (3.2.1)', theme.text)}
          {item('hover-content-not-dismissible (1.4.13)', theme.text)}
        </div>
        <div style={{ width: 660, background: theme.card, borderRadius: 16, border: `2px solid ${theme.yellow}`, padding: 36, opacity: interpolate(frame, [18, 30], [0, 1], { extrapolateRight: 'clamp' }) }}>
          <div style={{ fontFamily: theme.sans, fontSize: 38, fontWeight: 700, color: theme.yellow }}>Suspects — confirm, don't hunt</div>
          <div style={{ fontFamily: theme.sans, fontSize: 27, color: theme.subtext, marginTop: 8 }}>Pre-fill the review UI · never gate (unless --strict)</div>
          {item('target-size-suspect (2.5.8 geometry)', theme.text)}
          {item('focus-order-suspect (2.4.3 tab jumps)', theme.text)}
          {item('lang-of-parts-suspect (3.1.2)', theme.text)}
          {item('sensory-instruction-suspect (1.3.3)', theme.text)}
        </div>
      </div>
    </Scene>
  )
}

export const ReviewShotScene: React.FC = () => {
  const frame = useCurrentFrame()
  const drift = interpolate(frame, [0, 230], [0, -60])
  return (
    <Scene kicker="The manual half — humans or LLMs adjudicate collected evidence">
      <div style={{ width: 1420, margin: '0 auto', borderRadius: 16, overflow: 'hidden', border: `1px solid ${theme.border}`, boxShadow: '0 30px 80px rgba(0,0,0,0.55)', height: 830 }}>
        <Img src={staticFile('review-ui.png')} style={{ width: '100%', transform: `translateY(${drift}px)` }} />
      </div>
    </Scene>
  )
}

export const ScoreLoopScene: React.FC<{ lines: TermLine[] }> = ({ lines }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const progress = spring({ frame: frame - 120, fps, config: { damping: 30 }, durationInFrames: 70 })
  const score = Math.round(37 + progress * 63)
  return (
    <Scene kicker="Fix from the work order, verify with --baseline">
      <TerminalWindow title="fix → re-evaluate → progress">
        <TermLines lines={lines} />
      </TerminalWindow>
      <div style={{ width: 1480, margin: '40px auto 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: theme.mono, fontSize: 34, color: theme.text }}>
          <span>score</span>
          <span style={{ color: score === 100 ? theme.green : theme.yellow, fontWeight: 700 }}>{score}/100</span>
        </div>
        <div style={{ height: 26, background: theme.surface, borderRadius: 13, marginTop: 14, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${score}%`, background: `linear-gradient(90deg, ${theme.blue}, ${theme.green})`, borderRadius: 13 }} />
        </div>
      </div>
    </Scene>
  )
}

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const pop = spring({ frame, fps, config: { damping: 14 } })
  return (
    <AbsoluteFill style={{ background: theme.bg, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ transform: `scale(${pop})`, textAlign: 'center' }}>
        <div style={{ fontFamily: theme.mono, fontSize: 76, fontWeight: 700, color: theme.text }}>
          github.com/FrancoisChastel/<span style={{ color: theme.blue }}>a11y-eval</span>
        </div>
        <div style={{ fontFamily: theme.mono, fontSize: 34, color: theme.subtext, marginTop: 40, lineHeight: 1.8, opacity: interpolate(frame, [20, 40], [0, 1], { extrapolateRight: 'clamp' }) }}>
          <div>git clone https://github.com/FrancoisChastel/a11y-eval</div>
          <div>pnpm install &amp;&amp; npx playwright install chromium</div>
          <div style={{ color: theme.green }}>node src/cli.ts --repo /path/to/your-app</div>
        </div>
        <div style={{ fontFamily: theme.sans, fontSize: 28, color: theme.subtext, marginTop: 44, opacity: interpolate(frame, [40, 60], [0, 1], { extrapolateRight: 'clamp' }) }}>
          MIT · a "pass" is never a compliance claim — the manual criteria travel with the report
        </div>
      </div>
    </AbsoluteFill>
  )
}
