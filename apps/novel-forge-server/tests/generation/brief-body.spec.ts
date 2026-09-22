import { describe, expect, it } from 'bun:test';

import { parseBriefBody, renderBriefBody, renderSceneEvents, shiftBriefBody } from '@server/common';

const scene = {
  goal: 'Wren reaches the ferry',
  obstacle: 'The warden\ndoubles the toll.',
  turn: 'She pays with the map',
  beats: ['she haggles', ' the warden laughs '],
  estimatedWords: 700,
};

describe('renderSceneEvents', () => {
  it('should render each scene as one numbered line with its word share', () => {
    expect(renderSceneEvents([scene, { ...scene, estimatedWords: 900, beats: [] }])).toEqual([
      'Scene 1 (~700 words). Goal: Wren reaches the ferry. Obstacle: The warden doubles the toll. Turn: She pays with the map. Beats: she haggles; the warden laughs.',
      'Scene 2 (~900 words). Goal: Wren reaches the ferry. Obstacle: The warden doubles the toll. Turn: She pays with the map.',
    ]);
  });

  it('should survive the parse round trip that chapter renumbering relies on', () => {
    const input = { objective: 'Cross before chapter 4 ends.', events: renderSceneEvents([scene, scene]), continuesIntoNextChapter: true, handoffBeat: 'mid-stroke' };
    const body = renderBriefBody(input);

    expect(parseBriefBody(body)).toEqual(input);
    expect(shiftBriefBody(body, 3)).toBe(renderBriefBody({ ...input, objective: 'Cross before chapter 5 ends.' }));
  });
});
