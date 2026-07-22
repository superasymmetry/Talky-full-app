import { describe, expect, it } from 'vitest'
import { getEncounterConfig, getRiverConnections, getRiverTileKeys, getTileCoinReward, getTileDifficulty, getTileTerrainType, getTileWorldPosition, normalizePracticeGameState } from '../src/Lesson/PracticeGame.jsx'

describe('practice game helpers', () => {
  it('scales difficulty by distance from the origin', () => {
    expect(getTileDifficulty('-0.5,-0.5')).toBe(1)
    expect(getTileDifficulty('1,1')).toBe(2)
    expect(getTileDifficulty('2,2')).toBe(3)
  })

  it('returns varied encounter configs for different tile types', () => {
    const boss = getEncounterConfig('0,0')
    const team = getEncounterConfig('2,0')
    const terrain = getEncounterConfig('1,2')

    expect(boss.type).toBe('boss')
    expect(team.type).toBe('team')
    expect(terrain.type).toBe('terrain')
  })

  it('awards more coins for harsher tiles', () => {
    expect(getTileCoinReward('3,3')).toBeGreaterThan(getTileCoinReward('1,0'))
  })

  it('marks certain tiles as water terrain', () => {
    expect(getTileTerrainType('0,1')).toBe('water')
    expect(getTileTerrainType('2,2')).toBe('land')
  })

  it('positions tiles on the same world grid as the board', () => {
    expect(getTileWorldPosition('0,0', 0.2)).toEqual([0, 0.2, 0])
    expect(getTileWorldPosition('1,2', 0.1)).toEqual([1, 0.1, 2])
  })

  it('keeps river tiles connected with exactly two neighbors', () => {
    const connections = getRiverConnections()
    const riverTiles = getRiverTileKeys()

    riverTiles.forEach((tileKey) => {
      expect(connections[tileKey]).toHaveLength(2)
      connections[tileKey].forEach((neighbor) => {
        expect(riverTiles).toContain(neighbor)
      })
    })
  })

  it('restores saved progress with defaults for missing fields', () => {
    const restored = normalizePracticeGameState({
      energy: 42,
      coins: 150,
      capturedTiles: ['1,1', '2,2'],
      buildings: { '1,1': 'house' },
    })

    expect(restored.energy).toBe(42)
    expect(restored.coins).toBe(150)
    expect(restored.capturedTiles).toEqual(['1,1', '2,2'])
    expect(restored.buildings['1,1']).toBe('house')
    expect(restored.bank.capacity).toBe(600)
    expect(restored.party[0].name).toBe('Scout')
  })
})
