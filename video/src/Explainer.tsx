import React from 'react'
import { AbsoluteFill, Sequence } from 'remotion'
import { evalLines, fixLoopLines, mitigationsLines } from './content'
import { ArtifactsScene, OutroScene, ReviewShotScene, ScoreLoopScene, SuspectsScene, TerminalScene, TitleScene } from './scenes'
import { theme } from './theme'

// 30 fps · scene boundaries in frames
const SCENES = [
  { at: 0, dur: 90, node: <TitleScene /> },
  { at: 90, dur: 390, node: <TerminalScene kicker="One command — detect, scan, start, crawl, evaluate" title="a11y-eval — evaluate a repo" lines={evalLines} /> },
  { at: 480, dur: 180, node: <ArtifactsScene /> },
  { at: 660, dur: 220, node: <SuspectsScene /> },
  { at: 880, dur: 240, node: <ReviewShotScene /> },
  { at: 1120, dur: 260, node: <TerminalScene kicker="Mitigations are a work order, not a report" title="agent-executable fixes" lines={mitigationsLines} /> },
  { at: 1380, dur: 270, node: <ScoreLoopScene lines={fixLoopLines} /> },
  { at: 1650, dur: 180, node: <OutroScene /> },
]

export const TOTAL_FRAMES = 1830

export const Explainer: React.FC = () => (
  <AbsoluteFill style={{ background: theme.bg }}>
    {SCENES.map((scene, index) => (
      <Sequence key={index} from={scene.at} durationInFrames={scene.dur}>
        {scene.node}
      </Sequence>
    ))}
  </AbsoluteFill>
)
