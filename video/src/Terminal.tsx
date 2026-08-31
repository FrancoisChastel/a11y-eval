import React from 'react'
import { interpolate, useCurrentFrame } from 'remotion'
import { theme } from './theme'

export interface TermLine {
  text: string
  /** Frame (relative to the sequence) at which this line appears. */
  at: number
  /** Typed character-by-character with a prompt. */
  cmd?: boolean
  color?: string
  bold?: boolean
}

const TYPE_SPEED = 1.4 // characters per frame

export const TerminalWindow: React.FC<{ title: string; children: React.ReactNode; width?: number }> = ({
  title,
  children,
  width = 1480,
}) => (
  <div
    style={{
      width,
      margin: '0 auto',
      background: theme.card,
      borderRadius: 18,
      border: `1px solid ${theme.border}`,
      boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
      overflow: 'hidden',
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '16px 22px',
        background: theme.surface,
      }}
    >
      {['#ed8796', '#eed49f', '#a6da95'].map((c) => (
        <div key={c} style={{ width: 16, height: 16, borderRadius: 8, background: c }} />
      ))}
      <span style={{ marginLeft: 14, color: theme.subtext, fontFamily: theme.mono, fontSize: 22 }}>{title}</span>
    </div>
    <div style={{ padding: '30px 38px', fontFamily: theme.mono, fontSize: 27, lineHeight: 1.65 }}>{children}</div>
  </div>
)

export const TermLines: React.FC<{ lines: TermLine[] }> = ({ lines }) => {
  const frame = useCurrentFrame()
  const lastCmd = [...lines].reverse().find((l) => l.cmd && frame >= l.at)

  return (
    <>
      {lines.map((line, index) => {
        if (frame < line.at) return null
        const opacity = line.cmd ? 1 : interpolate(frame, [line.at, line.at + 6], [0, 1], { extrapolateRight: 'clamp' })
        let content = line.text
        let cursor = false
        if (line.cmd) {
          const chars = Math.floor((frame - line.at) * TYPE_SPEED)
          content = line.text.slice(0, chars)
          cursor = line === lastCmd && chars <= line.text.length + 12
        }
        return (
          <div key={index} style={{ opacity, whiteSpace: 'pre', color: line.color ?? theme.text, fontWeight: line.bold ? 700 : 400 }}>
            {line.cmd ? <span style={{ color: theme.mauve }}>{'❯ '}</span> : null}
            {content}
            {cursor && Math.floor(frame / 16) % 2 === 0 ? <span style={{ color: theme.text }}>▊</span> : null}
          </div>
        )
      })}
    </>
  )
}

/** Frame at which the last character of a typed command finishes. */
export const typedEnd = (line: TermLine): number => line.at + Math.ceil(line.text.length / TYPE_SPEED)
