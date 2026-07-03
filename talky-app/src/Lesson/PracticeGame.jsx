import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
import Back from './Back.jsx'

const EXPANSION_DISTANCE = 10
const TILE_SIZE = 1
const TILE_HEIGHT = 0.02
const ENERGY_COST = 10
const MAX_ENERGY = 80
const MAX_PARTY_SIZE = 4
const GENERATOR_TICK_SECONDS = 60
const BANK_STORAGE_PER_BANK = 300
const BANK_BUILD_COST = 500
const GENERATOR_BUILD_COST = 2000
const GENERATOR_STORAGE_PER_GENERATOR = 100
const MISSION_REWARD_COINS = 200
const STARTING_CAPTURED_TILE_COUNT = 16
const WORD_POOL = ['cat', 'ship', 'through', 'strength', 'sun', 'river']
const GENERATOR_CORE_TILES = ['-0.5,-0.5', '0.5,-0.5', '-0.5,0.5', '0.5,0.5']
const STARTING_BANK_TILES = ['-1.5,-0.5', '-1.5,0.5']

const CHARACTER_ARCHETYPES = {
  scout: { name: 'Scout', hp: 30, attack: 10 },
  villager: { name: 'Villager', hp: 20, attack: 7 },
  witch: { name: 'Witch', hp: 24, attack: 8 },
  bard: { name: 'Bard', hp: 22, attack: 6 },
}

function getPossessiveRole(role) {
  if (role === 'witch') return "Witches'"
  if (role === 'bard') return "Bards'"
  if (role === 'villager') return "Villagers'"
  return "Scouts'"
}

function createCharacter(role, nextCharacterId, duplicateIndex = 0) {
  const template = CHARACTER_ARCHETYPES[role] || CHARACTER_ARCHETYPES.scout
  const suffix = duplicateIndex > 0 ? ` ${duplicateIndex + 1}` : ''

  return {
    id: `${role}-${nextCharacterId}`,
    role,
    name: `${template.name}${suffix}`,
    hp: template.hp,
    maxHp: template.hp,
    attack: template.attack,
    level: 1,
  }
}

function addCharacterToParty(currentState, role) {
  if (currentState.party.length >= MAX_PARTY_SIZE) {
    return { nextState: currentState, added: null }
  }

  const duplicateIndex = currentState.party.filter((member) => member.role === role).length
  const nextMember = createCharacter(role, currentState.nextCharacterId, duplicateIndex)

  return {
    added: nextMember,
    nextState: {
      ...currentState,
      party: [...currentState.party, nextMember],
      nextCharacterId: currentState.nextCharacterId + 1,
      partySlots: MAX_PARTY_SIZE,
    },
  }
}

function createInitialOwnedTiles() {
  const ownedTiles = []
  const start = -1.5

  for (let x = 0; x < 4; x += 1) {
    for (let z = 0; z < 4; z += 1) {
      ownedTiles.push(`${start + x},${start + z}`)
    }
  }

  return ownedTiles
}

function parseTileKey(tileKey) {
  const [x, z] = tileKey.split(',').map(Number)
  return { key: tileKey, x, z }
}

export function getTileWorldPosition(tileKey, y = 0) {
  const { x, z } = parseTileKey(tileKey)
  return [x * TILE_SIZE, y, z * TILE_SIZE]
}

function getTileDistanceFromOrigin(tileKey) {
  const { x, z } = parseTileKey(tileKey)
  return Math.sqrt(x * x + z * z)
}

export function getRiverConnections() {
  return {
    '0,0': ['1,0', '0,1'],
    '1,0': ['0,0', '1,1'],
    '1,1': ['1,0', '0,1'],
    '0,1': ['0,0', '1,1'],
  }
}

export function getRiverTileKeys() {
  return Object.keys(getRiverConnections())
}

function getWaterTerrainTiles() {
  return [
    ...getRiverTileKeys().map((key) => ({ key, kind: 'river' })),
    { key: '2,-1', kind: 'lake' },
    { key: '-2,1', kind: 'lake' },
  ]
}

export function getTileTerrainType(tileKey) {
  return getWaterTerrainTiles().some((tile) => tile.key === tileKey) ? 'water' : 'land'
}

function getTileEncounterType(tileKey) {
  const { x, z } = parseTileKey(tileKey)

  if (Math.abs(x) <= 1 && Math.abs(z) <= 1) {
    return 'boss'
  }

  if (((x + z) % 2) === 0) {
    return 'team'
  }

  return 'terrain'
}

export function getTileDifficulty(tileKey) {
  return Math.max(1, Math.round(getTileDistanceFromOrigin(tileKey) + 0.5))
}

export function getEncounterConfig(tileKey) {
  const difficulty = getTileDifficulty(tileKey)
  const encounterType = getTileEncounterType(tileKey)

  if (encounterType === 'team') {
    const enemyCount = difficulty >= 3 ? 3 : 2
    return {
      type: 'team',
      label: 'T',
      name: `Rogue Team x${enemyCount}`,
      hp: 14 + difficulty * 4,
      maxHp: 14 + difficulty * 4,
      attack: 2 + Math.max(0, Math.floor(difficulty / 2)),
      enemyCount,
    }
  }

  if (encounterType === 'terrain') {
    return {
      type: 'terrain',
      label: 'R',
      name: 'Terrain Sentinel',
      hp: 26 + difficulty * 6,
      maxHp: 26 + difficulty * 6,
      attack: 1 + Math.max(0, Math.floor(difficulty / 3)),
      enemyCount: 1,
    }
  }

  return {
    type: 'boss',
    label: 'B',
    name: 'Tile Guardian',
    hp: 24 + difficulty * 5,
    maxHp: 24 + difficulty * 5,
    attack: 3 + Math.max(0, Math.floor(difficulty / 2)),
    enemyCount: 1,
  }
}

export function getTileCoinReward(tileKey) {
  return Math.round(100 + Math.max(0, getTileDifficulty(tileKey) - 1) * 25 + Math.max(0, getTileDistanceFromOrigin(tileKey) - 0.5) * 10)
}

function normalizeWord(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function evaluateWord(spokenWord, targetWord, attack) {
  const spoken = normalizeWord(spokenWord)
  const target = normalizeWord(targetWord)

  if (!spoken || !target) {
    return { outcome: 'miss', damage: 0 }
  }

  if (spoken === target) {
    return { outcome: 'full', damage: attack }
  }

  if (spoken.includes(target) || target.includes(spoken)) {
    return { outcome: 'partial', damage: Math.ceil(attack / 2) }
  }

  const overlap = [...new Set(target)].filter((char) => spoken.includes(char)).length
  if (overlap >= Math.max(2, Math.floor(target.length * 0.5))) {
    return { outcome: 'partial', damage: Math.ceil(attack / 2) }
  }

  return { outcome: 'miss', damage: 0 }
}

function isAdjacentToOwned(tileKey, ownedTiles) {
  const { x, z } = parseTileKey(tileKey)
  const ownedSet = new Set(ownedTiles)

  return (
    ownedSet.has(`${x + 1},${z}`) ||
    ownedSet.has(`${x - 1},${z}`) ||
    ownedSet.has(`${x},${z + 1}`) ||
    ownedSet.has(`${x},${z - 1}`)
  )
}

function getTotalBankCount(buildings = {}) {
  return Object.values(buildings).filter((value) => value === 'bank').length
}

function getAdditionalBankCount(buildings = {}) {
  return Math.max(0, getTotalBankCount(buildings) - STARTING_BANK_TILES.length)
}

function getTotalGeneratorCount(buildings = {}) {
  const builtGeneratorCount = Object.values(buildings).filter((value) => value === 'generator').length
  return 1 + builtGeneratorCount
}

function getAdditionalGeneratorCount(buildings = {}) {
  return Math.max(0, getTotalGeneratorCount(buildings) - 1)
}

function getBankCapacity(buildings = {}) {
  return getTotalBankCount(buildings) * BANK_STORAGE_PER_BANK
}

function getGeneratorCapacity(buildings = {}) {
  return getTotalGeneratorCount(buildings) * GENERATOR_STORAGE_PER_GENERATOR
}

function isStartingGameState(state) {
  if (!state) {
    return false
  }

  const totalBanks = getTotalBankCount(state.buildings)
  const totalGenerators = getTotalGeneratorCount(state.buildings)
  return (
    Number(state.capturedTiles?.length || 0) === STARTING_CAPTURED_TILE_COUNT &&
    totalBanks === STARTING_BANK_TILES.length &&
    totalGenerators === 1
  )
}

function getTutorialTargetTile(capturedTiles = [], buildings = {}) {
  const capturedSet = new Set(capturedTiles)
  const candidates = []

  capturedTiles.forEach((tileKey) => {
    const { x, z } = parseTileKey(tileKey)
    const neighbors = [
      `${x + 1},${z}`,
      `${x - 1},${z}`,
      `${x},${z + 1}`,
      `${x},${z - 1}`,
    ]

    neighbors.forEach((neighborKey) => {
      if (capturedSet.has(neighborKey)) {
        return
      }
      if (buildings[neighborKey]) {
        return
      }
      if (getTileTerrainType(neighborKey) === 'water') {
        return
      }
      candidates.push(neighborKey)
    })
  })

  const uniqueCandidates = Array.from(new Set(candidates))
  uniqueCandidates.sort((a, b) => getTileDistanceFromOrigin(a) - getTileDistanceFromOrigin(b))
  return uniqueCandidates[0] || null
}

function toDayKey(timestamp = Date.now()) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getDayIndexFromStart(firstPlayedAt, now = Date.now()) {
  const start = new Date(firstPlayedAt)
  const current = new Date(now)
  start.setHours(0, 0, 0, 0)
  current.setHours(0, 0, 0, 0)
  const elapsedMs = Math.max(0, current.getTime() - start.getTime())
  return Math.floor(elapsedMs / 86400000) + 1
}

function getMissionTargets(dayIndex) {
  const safeDayIndex = Math.max(1, Number(dayIndex) || 1)
  return {
    tilesCaptured: Math.min(30, 2 + Math.floor((safeDayIndex - 1) / 2)),
    buildingsBuilt: Math.min(20, 1 + Math.floor((safeDayIndex - 1) / 3)),
  }
}

function createDailyMissions(dayIndex) {
  const targets = getMissionTargets(dayIndex)

  return [
    {
      id: 'capture-tiles',
      title: 'Capture Territory',
      description: `Capture ${targets.tilesCaptured} tile${targets.tilesCaptured === 1 ? '' : 's'}.`,
      metric: 'tilesCaptured',
      target: targets.tilesCaptured,
      progress: 0,
      completed: false,
      claimed: false,
      reward: MISSION_REWARD_COINS,
    },
    {
      id: 'build-structures',
      title: 'Build Structures',
      description: `Build ${targets.buildingsBuilt} building${targets.buildingsBuilt === 1 ? '' : 's'}.`,
      metric: 'buildingsBuilt',
      target: targets.buildingsBuilt,
      progress: 0,
      completed: false,
      claimed: false,
      reward: MISSION_REWARD_COINS,
    },
  ]
}

function buildMissionsState(existingMissions, now = Date.now()) {
  const currentDayKey = toDayKey(now)
  const firstPlayedAt = Number(existingMissions?.firstPlayedAt || now)
  const dayIndex = getDayIndexFromStart(firstPlayedAt, now)
  const shouldRollDaily = !existingMissions || existingMissions.currentDayKey !== currentDayKey
  const baselineMissions = createDailyMissions(dayIndex)

  if (shouldRollDaily) {
    return {
      firstPlayedAt,
      currentDayKey,
      dayIndex,
      dailyStats: {
        tilesCaptured: 0,
        buildingsBuilt: 0,
      },
      items: baselineMissions,
    }
  }

  const dailyStats = {
    tilesCaptured: Math.max(0, Number(existingMissions?.dailyStats?.tilesCaptured || 0)),
    buildingsBuilt: Math.max(0, Number(existingMissions?.dailyStats?.buildingsBuilt || 0)),
  }

  const existingItems = Array.isArray(existingMissions?.items) ? existingMissions.items : []
  const items = baselineMissions.map((mission) => {
    const existing = existingItems.find((entry) => entry.id === mission.id)
    const progress = Math.min(mission.target, Math.max(0, Number(existing?.progress ?? dailyStats[mission.metric] ?? 0)))
    const completed = progress >= mission.target
    return {
      ...mission,
      progress,
      completed,
      claimed: completed ? Boolean(existing?.claimed) : false,
    }
  })

  return {
    firstPlayedAt,
    currentDayKey,
    dayIndex,
    dailyStats,
    items,
  }
}

function applyMissionProgress(currentState, delta = {}) {
  const missionsState = buildMissionsState(currentState.missions)
  const nextDailyStats = {
    tilesCaptured: Math.max(0, (missionsState.dailyStats.tilesCaptured || 0) + (delta.tilesCaptured || 0)),
    buildingsBuilt: Math.max(0, (missionsState.dailyStats.buildingsBuilt || 0) + (delta.buildingsBuilt || 0)),
  }

  const nextItems = missionsState.items.map((mission) => {
    const progress = Math.min(mission.target, nextDailyStats[mission.metric] || 0)
    return {
      ...mission,
      progress,
      completed: progress >= mission.target,
    }
  })

  return {
    ...currentState,
    missions: {
      ...missionsState,
      dailyStats: nextDailyStats,
      items: nextItems,
    },
  }
}

function createInitialGameState() {
  const initialBuildings = {
    ...Object.fromEntries(GENERATOR_CORE_TILES.map((tileKey) => [tileKey, 'generator-core'])),
    ...Object.fromEntries(STARTING_BANK_TILES.map((tileKey) => [tileKey, 'bank'])),
  }
  const starterScout = createCharacter('scout', 1, 0)
  const missions = buildMissionsState(null)
  const initialCapacity = getBankCapacity(initialBuildings)
  const initialGeneratorCapacity = getGeneratorCapacity(initialBuildings)

  return {
    energy: 80,
    coins: 300,
    capturedTiles: createInitialOwnedTiles(),
    buildings: initialBuildings,
    bank: {
      coins: 0,
      capacity: initialCapacity,
    },
    generator: {
      coins: 0,
      capacity: initialGeneratorCapacity,
      nextCoinAt: Date.now() + GENERATOR_TICK_SECONDS * 1000,
    },
    party: [starterScout],
    nextCharacterId: 2,
    partySlots: MAX_PARTY_SIZE,
    missions,
  }
}

export function normalizePracticeGameState(savedState) {
  const baseState = createInitialGameState()

  if (!savedState || typeof savedState !== 'object') {
    return baseState
  }

  const normalizedBank = {
    coins: Number(savedState?.bank?.coins ?? 0),
    capacity: Number(savedState?.bank?.capacity ?? 0),
  }

  const normalizedGenerator = {
    coins: Number(savedState?.generator?.coins ?? 0),
    capacity: Number(savedState?.generator?.capacity ?? 0),
    nextCoinAt: Number(savedState?.generator?.nextCoinAt ?? savedState?.bank?.nextCoinAt ?? Date.now() + GENERATOR_TICK_SECONDS * 1000),
  }

  const normalizedParty = Array.isArray(savedState?.party) && savedState.party.length > 0
    ? savedState.party.map((member, index) => {
        const role = member?.role || 'scout'
        return {
          id: member?.id || `${role}-legacy-${index + 1}`,
          role,
          name: member?.name || (CHARACTER_ARCHETYPES[role]?.name || 'Scout'),
          hp: Number(member?.hp ?? 30),
          maxHp: Number(member?.maxHp ?? 30),
          attack: Number(member?.attack ?? 10),
          level: Number(member?.level ?? 1),
        }
      }).slice(0, MAX_PARTY_SIZE)
    : baseState.party

  const normalizedBuildings = {
    ...baseState.buildings,
    ...(savedState?.buildings || {}),
  }

  GENERATOR_CORE_TILES.forEach((tileKey) => {
    normalizedBuildings[tileKey] = 'generator-core'
  })
  STARTING_BANK_TILES.forEach((tileKey) => {
    normalizedBuildings[tileKey] = 'bank'
  })

  const computedCapacity = getBankCapacity(normalizedBuildings)
  const computedGeneratorCapacity = getGeneratorCapacity(normalizedBuildings)

  const normalizedMissions = buildMissionsState(savedState?.missions)

  return {
    ...baseState,
    ...savedState,
    energy: Math.max(0, Math.min(MAX_ENERGY, Number(savedState?.energy ?? baseState.energy))),
    coins: Math.max(0, Number(savedState?.coins ?? baseState.coins)),
    capturedTiles: Array.isArray(savedState?.capturedTiles) ? savedState.capturedTiles : baseState.capturedTiles,
    buildings: normalizedBuildings,
    bank: {
      ...baseState.bank,
      ...normalizedBank,
      coins: Math.min(Math.max(0, normalizedBank.coins), computedCapacity),
      capacity: computedCapacity,
    },
    generator: {
      ...baseState.generator,
      ...normalizedGenerator,
      coins: Math.min(Math.max(0, normalizedGenerator.coins), computedGeneratorCapacity),
      capacity: computedGeneratorCapacity,
    },
    party: normalizedParty,
    nextCharacterId: Math.max(
      Number(savedState?.nextCharacterId ?? 1),
      normalizedParty.reduce((maxValue, member) => {
        const parsed = Number(String(member.id || '').split('-').pop())
        if (Number.isNaN(parsed)) {
          return maxValue
        }
        return Math.max(maxValue, parsed + 1)
      }, 1),
    ),
    partySlots: MAX_PARTY_SIZE,
    missions: normalizedMissions,
  }
}

function BattleScene() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[16, 10]} />
        <meshStandardMaterial color="#0f172a" roughness={0.95} metalness={0.1} />
      </mesh>
      <mesh position={[-3.5, 0.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[1, 1.5, 1]} />
        <meshStandardMaterial color="#22c55e" emissive="#15803d" emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[3.5, 0.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[1, 1.5, 1]} />
        <meshStandardMaterial color="#ef4444" emissive="#b91c1c" emissiveIntensity={0.25} />
      </mesh>
      <pointLight position={[-3.5, 3, 0]} intensity={1.5} color="#4ade80" />
      <pointLight position={[3.5, 3, 0]} intensity={1.5} color="#f87171" />
      <directionalLight position={[0, 5, 4]} intensity={0.9} />
    </group>
  )
}

function PlaneScene({ capturedTiles, buildings, buildMode, selectedBuilding, hoveredTileKey, onTileHover, onTileClick, tutorialTileKey, showTutorialTileGuide }) {
  const capturedSet = useMemo(() => new Set(capturedTiles), [capturedTiles])
  const hasGeneratorCore = useMemo(
    () => GENERATOR_CORE_TILES.every((tileKey) => buildings[tileKey] === 'generator-core'),
    [buildings],
  )

  const visibleTiles = useMemo(() => {
    const tiles = new Set()

    capturedTiles.forEach((tileKey) => {
      const { x, z } = parseTileKey(tileKey)

      for (let dx = -EXPANSION_DISTANCE; dx <= EXPANSION_DISTANCE; dx += 1) {
        for (let dz = -EXPANSION_DISTANCE; dz <= EXPANSION_DISTANCE; dz += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) <= EXPANSION_DISTANCE) {
            tiles.add(`${x + dx},${z + dz}`)
          }
        }
      }
    })

    return Array.from(tiles, parseTileKey).sort((a, b) => {
      if (a.x === b.x) return a.z - b.z
      return a.x - b.x
    })
  }, [capturedTiles])

  const fenceSegments = useMemo(() => {
    const segments = []

    capturedTiles.forEach((tileKey) => {
      const { x, z } = parseTileKey(tileKey)
      const directions = [
        { dx: 1, dz: 0, axis: 'x' },
        { dx: -1, dz: 0, axis: 'x' },
        { dx: 0, dz: 1, axis: 'z' },
        { dx: 0, dz: -1, axis: 'z' },
      ]

      directions.forEach(({ dx, dz, axis }) => {
        const neighborKey = `${x + dx},${z + dz}`
        if (!capturedSet.has(neighborKey)) {
          const position = axis === 'x'
            ? [x * TILE_SIZE + (dx > 0 ? 0.5 : -0.5), 0.25, z * TILE_SIZE]
            : [x * TILE_SIZE, 0.25, z * TILE_SIZE + (dz > 0 ? 0.5 : -0.5)]
          const scale = axis === 'x'
            ? [0.08, 0.5, 1.0]
            : [1.0, 0.5, 0.08]

          segments.push({ key: `${tileKey}-${neighborKey}`, position, scale })
        }
      })
    })

    return segments
  }, [capturedSet, capturedTiles])

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1000, 1000]} />
        <meshStandardMaterial color="#16a34a" metalness={0.05} roughness={0.95} />
      </mesh>

      {fenceSegments.map((segment) => (
        <mesh key={segment.key} position={segment.position} castShadow receiveShadow>
          <boxGeometry args={segment.scale} />
          <meshStandardMaterial color="#f59e0b" emissive="#92400e" emissiveIntensity={0.5} />
        </mesh>
      ))}

      {hasGeneratorCore && (
        <group position={[0, 0.18, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[1.24, 0.16, 1.24]} />
            <meshStandardMaterial color="#1d4ed8" emissive="#38bdf8" emissiveIntensity={0.45} />
          </mesh>
          <mesh position={[0, 0.02, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.36, 0.02, 1.36]} />
            <meshStandardMaterial color="#f8fafc" emissive="#f8fafc" emissiveIntensity={0.15} />
          </mesh>
          <mesh position={[-0.68, 0.02, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.1, 0.02, 1.3]} />
            <meshStandardMaterial color="#f8fafc" emissive="#f8fafc" emissiveIntensity={0.12} />
          </mesh>
          <mesh position={[0.68, 0.02, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.1, 0.02, 1.3]} />
            <meshStandardMaterial color="#f8fafc" emissive="#f8fafc" emissiveIntensity={0.12} />
          </mesh>
          <mesh position={[0, 0.02, -0.68]} castShadow receiveShadow>
            <boxGeometry args={[1.3, 0.02, 0.1]} />
            <meshStandardMaterial color="#f8fafc" emissive="#f8fafc" emissiveIntensity={0.12} />
          </mesh>
          <mesh position={[0, 0.02, 0.68]} castShadow receiveShadow>
            <boxGeometry args={[1.3, 0.02, 0.1]} />
            <meshStandardMaterial color="#f8fafc" emissive="#f8fafc" emissiveIntensity={0.12} />
          </mesh>
          <Text position={[0, 0.2, 0]} fontSize={0.16} color="#bfdbfe" anchorX="center" anchorY="middle">
            Generator
          </Text>
        </group>
      )}

      {visibleTiles.map((tile) => {
        const isOwned = capturedSet.has(tile.key)
        const buildingType = buildings[tile.key]
        const isBuilt = Boolean(buildingType)
        const canBuild = buildMode && isOwned && !isBuilt
        const encounter = getEncounterConfig(tile.key)
        const isBankTile = buildingType === 'bank'
        const isGeneratorTile = buildingType === 'generator-core' || buildingType === 'generator'
        const isWater = getTileTerrainType(tile.key) === 'water'
        const isRiverTile = isWater && getRiverTileKeys().includes(tile.key)
        const isHovered = hoveredTileKey === tile.key
        const baseColor = isBankTile
          ? '#0ea5e9'
          : isGeneratorTile
            ? '#1d4ed8'
          : isWater
            ? (isRiverTile ? '#86efac' : '#4ade80')
            : isOwned
              ? (isBuilt ? '#7c3aed' : '#f59e0b')
              : (canBuild ? '#0f766e' : '#bbf7d0')
        const hoverColor = isBankTile
          ? '#38bdf8'
          : isGeneratorTile
            ? '#60a5fa'
          : isWater
            ? '#dcfce7'
            : encounter.type === 'team'
              ? '#fb923c'
              : encounter.type === 'terrain'
                ? '#34d399'
                : '#f43f5e'
        const showGridIndicator = !isOwned && !isBuilt && !isBankTile && !isGeneratorTile && !canBuild && !isWater

        return (
          <group key={tile.key}>
            <mesh
              position={getTileWorldPosition(tile.key, TILE_HEIGHT)}
              rotation={[-Math.PI / 2, 0, 0]}
              onClick={(event) => {
                event.stopPropagation()
                onTileClick(tile.key)
              }}
              onPointerOver={(event) => {
                event.stopPropagation()
                onTileHover(tile.key)
              }}
              onPointerOut={() => onTileHover(null)}
              receiveShadow
              castShadow
            >
              <planeGeometry args={[0.98, 0.98]} />
              <meshStandardMaterial
                color={isHovered ? hoverColor : baseColor}
                roughness={0.95}
                side={THREE.DoubleSide}
              />
            </mesh>
            {showGridIndicator && (
              <lineLoop position={getTileWorldPosition(tile.key, 0.002)}>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    args={[
                      new Float32Array([
                        -0.49, 0, -0.49,
                        0.49, 0, -0.49,
                        0.49, 0, 0.49,
                        -0.49, 0, 0.49,
                        -0.49, 0, -0.49,
                      ]),
                      3,
                    ]}
                  />
                </bufferGeometry>
                <lineBasicMaterial color="#d1fae5" transparent opacity={0.9} />
              </lineLoop>
            )}
            {isHovered && !isOwned && (
              <Text position={getTileWorldPosition(tile.key, 0.3)} fontSize={0.18} color="#f8fafc" anchorX="center" anchorY="middle">
                {encounter.label}
              </Text>
            )}
            {isBuilt && (
              <mesh position={[tile.x * TILE_SIZE, 0.24, tile.z * TILE_SIZE]} castShadow receiveShadow>
                <boxGeometry args={[0.35, 0.35, 0.35]} />
                <meshStandardMaterial
                  color={isBankTile ? '#38bdf8' : isGeneratorTile ? '#1d4ed8' : '#7c3aed'}
                  emissive={isBankTile ? '#0284c7' : isGeneratorTile ? '#1e40af' : '#5b21b6'}
                  emissiveIntensity={0.4}
                />
              </mesh>
            )}
            {selectedBuilding && canBuild && (
              <mesh position={[tile.x * TILE_SIZE, 0.12, tile.z * TILE_SIZE]} castShadow receiveShadow>
                <sphereGeometry args={[0.18, 16, 16]} />
                <meshStandardMaterial color="#fef3c7" emissive="#f59e0b" emissiveIntensity={0.5} />
              </mesh>
            )}
            {showTutorialTileGuide && tutorialTileKey === tile.key && (
              <>
                <mesh position={[tile.x * TILE_SIZE, 0.08, tile.z * TILE_SIZE]} rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[0.28, 0.46, 48]} />
                  <meshStandardMaterial color="#facc15" emissive="#f59e0b" emissiveIntensity={0.85} transparent opacity={0.95} side={THREE.DoubleSide} />
                </mesh>
                <Text position={[tile.x * TILE_SIZE, 0.42, tile.z * TILE_SIZE]} fontSize={0.14} color="#fef08a" anchorX="center" anchorY="middle">
                  Tutorial Tile
                </Text>
              </>
            )}
          </group>
        )
      })}

    </group>
  )
}

export default function PracticeGame() {
  const [gameState, setGameState] = useState(() => {
    if (typeof window === 'undefined') {
      return createInitialGameState()
    }

    try {
      const saved = window.localStorage.getItem('practiceGameState')
      return saved ? normalizePracticeGameState(JSON.parse(saved)) : createInitialGameState()
    } catch (error) {
      console.warn('Failed to restore practice game state', error)
      return createInitialGameState()
    }
  })
  const [battleState, setBattleState] = useState(null)
  const [buildMode, setBuildMode] = useState(false)
  const [selectedBuilding, setSelectedBuilding] = useState(null)
  const [selectedCharacter, setSelectedCharacter] = useState(null)
  const [statusMessage, setStatusMessage] = useState('Select a tile to fight or build on it.')
  const [isListening, setIsListening] = useState(false)
  const [pendingBattle, setPendingBattle] = useState(null)
  const [selectedGeneratorTile, setSelectedGeneratorTile] = useState(null)
  const [hoveredTileKey, setHoveredTileKey] = useState(null)
  const [showStatsMenu, setShowStatsMenu] = useState(false)
  const [showPartyEditor, setShowPartyEditor] = useState(false)
  const [showMissions, setShowMissions] = useState(false)
  const [tutorialStep, setTutorialStep] = useState(null)
  const [tutorialTileKey, setTutorialTileKey] = useState(null)
  const [tutorialDismissedInStartState, setTutorialDismissedInStartState] = useState(false)
  const [energyRefreshSeconds, setEnergyRefreshSeconds] = useState(60)
  const [nextEnergyRefreshAt, setNextEnergyRefreshAt] = useState(() => Date.now() + 60000)
  const recognitionRef = useRef(null)
  const battleStateRef = useRef(null)
  const speakMessageRef = useRef(null)
  const energyChipRef = useRef(null)
  const economyChipRef = useRef(null)
  const missionsButtonRef = useRef(null)
  const buildButtonRef = useRef(null)
  const partyButtonRef = useRef(null)

  const isTutorialStartState = useMemo(() => isStartingGameState(gameState), [gameState])
  const isTutorialCaptureStep = tutorialStep === 1 && Boolean(tutorialTileKey)
  const hasTutorialHouse = useMemo(() => Object.values(gameState.buildings || {}).includes('house'), [gameState.buildings])

  useEffect(() => {
    if (tutorialStep === null && !tutorialDismissedInStartState) {
      if (!isTutorialStartState) {
        return
      }

      setTutorialStep(0)
      setTutorialTileKey(getTutorialTargetTile(gameState.capturedTiles, gameState.buildings))
    }
  }, [gameState.buildings, gameState.capturedTiles, isTutorialStartState, tutorialDismissedInStartState, tutorialStep])

  useEffect(() => {
    if (!isTutorialCaptureStep || !tutorialTileKey) {
      return
    }

    if (gameState.capturedTiles.includes(tutorialTileKey)) {
      setTutorialStep(2)
      setStatusMessage('Great first capture! Now we will walk through each feature one by one.')
    }
  }, [gameState.capturedTiles, isTutorialCaptureStep, tutorialTileKey])

  useEffect(() => {
    if (tutorialStep === 4 && hasTutorialHouse) {
      setTutorialStep(5)
      setStatusMessage('Nice work. You built a house and gained a villager.')
    }
  }, [hasTutorialHouse, tutorialStep])

  useEffect(() => {
    battleStateRef.current = battleState
  }, [battleState])

  useEffect(() => {
    if (!gameState.party.length) {
      setSelectedCharacter(null)
      return
    }

    if (!selectedCharacter || !gameState.party.some((member) => member.id === selectedCharacter)) {
      setSelectedCharacter(gameState.party[0].id)
    }
  }, [gameState.party, selectedCharacter])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      window.localStorage.setItem('practiceGameState', JSON.stringify(gameState))
    } catch (error) {
      console.warn('Failed to save practice game state', error)
    }
  }, [gameState])

  const speakLessonMessage = (message) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      return
    }

    try {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(message)
      const savedVoice = window.localStorage.getItem('ttsVoice')
      if (savedVoice) {
        const voices = window.speechSynthesis.getVoices()
        const voice = voices.find((entry) => entry.name === savedVoice)
        if (voice) {
          utterance.voice = voice
        }
      }
      utterance.rate = 1.02
      utterance.pitch = 1
      window.speechSynthesis.speak(utterance)
      speakMessageRef.current = utterance
    } catch (error) {
      console.warn('TTS failed', error)
    }
  }

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      return undefined
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || '')
        .join(' ')
        .trim()

      setIsListening(false)
      if (battleStateRef.current?.status === 'waitingForInput') {
        handleBattleResolution(transcript)
      }
    }

    recognition.onerror = () => {
      setIsListening(false)
      setStatusMessage('Speech recognition unavailable. Use the text box instead.')
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition
    return () => recognition.stop()
  }, [battleState?.status])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((nextEnergyRefreshAt - Date.now()) / 1000))
      setEnergyRefreshSeconds(remaining)

      if (remaining <= 0) {
        setNextEnergyRefreshAt(Date.now() + 60000)
        setEnergyRefreshSeconds(60)
        if (gameState.energy < MAX_ENERGY) {
          setGameState((current) => ({
            ...current,
            energy: Math.min(MAX_ENERGY, current.energy + 1),
          }))
        }
      }

      setGameState((current) => {
        const todayKey = toDayKey()
        const missionsState = current.missions?.currentDayKey === todayKey
          ? current.missions
          : buildMissionsState(current.missions)

        if (!current.bank || !current.generator) {
          if (missionsState === current.missions) {
            return current
          }

          return {
            ...current,
            missions: missionsState,
          }
        }

        const bankCapacity = getBankCapacity(current.buildings)
        const generatorCount = getTotalGeneratorCount(current.buildings)
        const generatorCapacity = getGeneratorCapacity(current.buildings)

        if (Date.now() < current.generator.nextCoinAt || generatorCount <= 0 || generatorCapacity <= 0 || current.generator.coins >= generatorCapacity) {
          if (missionsState === current.missions) {
            return current
          }

          return {
            ...current,
            missions: missionsState,
            bank: {
              ...current.bank,
              capacity: bankCapacity,
              coins: Math.min(current.bank.coins, bankCapacity),
            },
            generator: {
              ...current.generator,
              capacity: generatorCapacity,
              coins: Math.min(current.generator.coins, generatorCapacity),
            },
          }
        }

        const elapsedSinceNext = Math.max(0, Date.now() - current.generator.nextCoinAt)
        const generationCycles = Math.floor(elapsedSinceNext / (GENERATOR_TICK_SECONDS * 1000)) + 1
        const generatedCoins = generationCycles * generatorCount

        return {
          ...current,
          missions: missionsState,
          bank: {
            ...current.bank,
            capacity: bankCapacity,
            coins: Math.min(current.bank.coins, bankCapacity),
          },
          generator: {
            ...current.generator,
            capacity: generatorCapacity,
            coins: Math.min(generatorCapacity, current.generator.coins + generatedCoins),
            nextCoinAt: current.generator.nextCoinAt + generationCycles * GENERATOR_TICK_SECONDS * 1000,
          },
        }
      })
    }, 1000)

    return () => window.clearInterval(interval)
  }, [gameState.energy, nextEnergyRefreshAt])

  const claimMissionReward = (missionId) => {
    setGameState((current) => {
      const missionsState = buildMissionsState(current.missions)
      const mission = missionsState.items.find((entry) => entry.id === missionId)

      if (!mission || !mission.completed || mission.claimed) {
        return {
          ...current,
          missions: missionsState,
        }
      }

      return {
        ...current,
        coins: current.coins + MISSION_REWARD_COINS,
        missions: {
          ...missionsState,
          items: missionsState.items.map((entry) => (
            entry.id === missionId
              ? { ...entry, claimed: true }
              : entry
          )),
        },
      }
    })

    setStatusMessage(`Mission complete. ${MISSION_REWARD_COINS} coins claimed.`)
  }

  const startListening = () => {
    if (!recognitionRef.current) {
      setStatusMessage('Speech recognition is not supported in this browser. Use the text box instead.')
      return
    }

    setIsListening(true)
    recognitionRef.current.start()
  }

  const handleTileClick = (tileKey) => {
    if (battleState) {
      return
    }

    const tileBuilding = gameState.buildings[tileKey]

    if (tileBuilding === 'bank') {
      setSelectedGeneratorTile(null)
      setStatusMessage('This is a bank. Banks only provide storage capacity.')
      return
    }

    if (tileBuilding === 'generator-core' || tileBuilding === 'generator') {
      setSelectedGeneratorTile(tileKey)
      setSelectedBankTile(null)
      setStatusMessage('Generator ready. Review output details.')
      return
    }

    if (getTileTerrainType(tileKey) === 'water') {
      setStatusMessage('This is a water tile. It cannot be built on or captured.')
      return
    }

    if (isTutorialCaptureStep && tileKey !== tutorialTileKey && !buildMode) {
      setStatusMessage('Tutorial: capture the highlighted tile first.')
      return
    }

    if (tutorialStep === 4 && !buildMode) {
      setStatusMessage('Tutorial: open Build Mode and place a House first.')
      return
    }

    if (buildMode) {
      if (!gameState.capturedTiles.includes(tileKey)) {
        setStatusMessage('Only captured tiles can hold buildings.')
        return
      }

      if (gameState.buildings[tileKey]) {
        setStatusMessage('That tile already has a building.')
        return
      }

      const buildingKey = selectedBuilding
      if (!buildingKey) {
        setStatusMessage('Choose a building first.')
        return
      }

      if (tutorialStep === 4 && buildingKey !== 'house') {
        setStatusMessage('Tutorial: build a House first to add your first villager.')
        return
      }

      const definition = buildingDefinitions.find((entry) => entry.key === buildingKey)
      if (!definition) {
        return
      }

      const extraCapturedTiles = Math.max(0, gameState.capturedTiles.length - 16)
      if (extraCapturedTiles < definition.unlock) {
        setStatusMessage(definition.lockLabel || `This building needs ${definition.unlock} extra captured tiles beyond the starting area first.`)
        return
      }

      if (gameState.coins < definition.cost) {
        setStatusMessage(`This building costs ${definition.cost} coins.`)
        return
      }

      const characterBuildingRole = {
        house: 'villager',
        hut: 'witch',
        cottage: 'bard',
      }[buildingKey]

      if (characterBuildingRole && gameState.party.length >= MAX_PARTY_SIZE) {
        setStatusMessage(`Party is full. Remove someone first (max ${MAX_PARTY_SIZE}).`)
        return
      }

      setGameState((current) => {
        let nextState = {
          ...current,
          buildings: { ...current.buildings, [tileKey]: buildingKey },
        }

        if (buildingKey === 'house' || buildingKey === 'hut' || buildingKey === 'cottage') {
          const role = buildingKey === 'house' ? 'villager' : buildingKey === 'hut' ? 'witch' : 'bard'
          const addedResult = addCharacterToParty(nextState, role)
          nextState = addedResult.nextState
        } else if (buildingKey === 'training') {
          const targetId = selectedCharacter || nextState.party[0]?.id
          const target = nextState.party.find((member) => member.id === targetId)
          if (target) {
            target.attack += 5
          }
        } else if (buildingKey === 'shelter') {
          const targetId = selectedCharacter || nextState.party[0]?.id
          const target = nextState.party.find((member) => member.id === targetId)
          if (target) {
            target.maxHp += 15
            target.hp = target.maxHp
          }
        }

        nextState = {
          ...nextState,
          coins: current.coins - definition.cost,
          partySlots: MAX_PARTY_SIZE,
        }

        return applyMissionProgress(nextState, { buildingsBuilt: 1 })
      })

      const placedName = definition.name
      setStatusMessage(`${placedName} placed.`)
      return
    }

    if (gameState.capturedTiles.includes(tileKey)) {
      setStatusMessage('That tile is already captured.')
      return
    }

    if (getTileTerrainType(tileKey) === 'water') {
      setStatusMessage('This is a water tile. It cannot be captured.')
      return
    }

    if (!isAdjacentToOwned(tileKey, gameState.capturedTiles)) {
      setStatusMessage('Only tiles next to owned territory can be challenged.')
      return
    }

    if (gameState.energy < ENERGY_COST) {
      setStatusMessage('Not enough energy to start a battle.')
      return
    }

    const difficulty = getTileDifficulty(tileKey)
    const encounterConfig = getEncounterConfig(tileKey)
    const targetWord = WORD_POOL[Math.floor(Math.random() * WORD_POOL.length)]
    const wordsInPlay = [targetWord, ...WORD_POOL.filter((word) => word !== targetWord).slice(0, 3)]

    setPendingBattle({
      tileKey,
      difficulty,
      encounterConfig,
      targetWord,
      wordsInPlay,
      party: gameState.party.map((member) => ({ ...member })),
      energyCost: ENERGY_COST,
      tutorialGuaranteed: isTutorialCaptureStep && tileKey === tutorialTileKey,
    })
    speakLessonMessage(`Prepare for ${encounterConfig.name}.`)
    setStatusMessage('Confirm the battle to spend energy and begin.')
  }

  const beginBattle = () => {
    if (!pendingBattle) {
      return
    }

    const { tileKey, difficulty, encounterConfig, targetWord, party } = pendingBattle
    setBattleState({
      tileKey,
      difficulty,
      enemyHp: encounterConfig.hp,
      enemyMaxHp: encounterConfig.maxHp,
      enemyAttack: encounterConfig.attack,
      enemyName: encounterConfig.name,
      enemyCount: encounterConfig.enemyCount,
      encounterType: encounterConfig.type,
      turnIndex: 0,
      round: 1,
      party: party.map((member) => ({ ...member })),
      log: [`Battle started against ${encounterConfig.name}.`],
      targetWord,
      pendingBoost: 1,
      poisonDamage: 0,
      poisonTurns: 0,
      tutorialGuaranteed: Boolean(pendingBattle.tutorialGuaranteed),
      status: 'waitingForInput',
    })

    setGameState((current) => ({
      ...current,
      energy: current.energy - ENERGY_COST,
    }))
    setPendingBattle(null)
    speakLessonMessage('Battle started. Speak the target word to attack!')
    setStatusMessage('Battle started. Speak the target word to attack!')
  }

  const handleBattleResolution = (spokenWord) => {
    const battle = battleStateRef.current
    if (!battle) {
      return
    }

    const typedWord = (spokenWord || '').trim()
    if (!typedWord) {
      setStatusMessage('Speak a word to resolve the turn.')
      return
    }

    const livingParty = battle.party.filter((member) => member.hp > 0)
    if (!livingParty.length) {
      if (battle.tutorialGuaranteed) {
        const restoredParty = battle.party.map((member) => ({ ...member, hp: member.maxHp }))
        setBattleState({
          ...battle,
          party: restoredParty,
          turnIndex: 0,
          round: battle.round + 1,
          log: [...battle.log, 'A tutorial blessing restored your party to full HP.'],
          targetWord: WORD_POOL[Math.floor(Math.random() * WORD_POOL.length)],
          status: 'waitingForInput',
        })
        setStatusMessage('Tutorial magic activated: your HP has been fully regenerated.')
        return
      }

      setBattleState(null)
      setStatusMessage('Your party was defeated. The tile remains uncaptured.')
      return
    }

    const currentCharacter = livingParty[battle.turnIndex]
    if (!currentCharacter) {
      const enemyDamage = Math.max(1, battle.enemyAttack)
      const updatedParty = battle.party.map((member) => ({ ...member }))
      const livingMembers = updatedParty.filter((member) => member.hp > 0)
      const targetMember = livingMembers[Math.floor(Math.random() * livingMembers.length)]
      if (targetMember) {
        targetMember.hp = Math.max(0, targetMember.hp - enemyDamage)
      }
      const nextLog = [...battle.log, `Enemy struck ${targetMember?.name || 'the party'} for ${enemyDamage} damage.`]

      if (updatedParty.every((member) => member.hp <= 0)) {
        if (battle.tutorialGuaranteed) {
          const restoredParty = updatedParty.map((member) => ({ ...member, hp: member.maxHp }))
          setBattleState({
            ...battle,
            party: restoredParty,
            round: battle.round + 1,
            turnIndex: 0,
            log: [...nextLog, 'A tutorial blessing restored your party to full HP.'],
            targetWord: WORD_POOL[Math.floor(Math.random() * WORD_POOL.length)],
            status: 'waitingForInput',
          })
          setStatusMessage('Tutorial magic activated: your HP has been fully regenerated.')
          return
        }

        setBattleState(null)
        setStatusMessage('The enemy defeated your party. The tile remains uncaptured.')
        return
      }

      setBattleState({
        ...battle,
        party: updatedParty,
        round: battle.round + 1,
        turnIndex: 0,
        log: nextLog,
        targetWord: WORD_POOL[Math.floor(Math.random() * WORD_POOL.length)],
        status: 'waitingForInput',
      })
      return
    }

    const isBard = currentCharacter.role === 'bard'
    const isWitch = currentCharacter.role === 'witch'
    let updatedEnemyHp = battle.enemyHp
    let nextPendingBoost = battle.pendingBoost || 1
    let nextPoisonDamage = battle.poisonDamage || 0
    let nextPoisonTurns = battle.poisonTurns || 0
    let nextLog = [...battle.log]

    if (isBard) {
      const buffTarget = livingParty.find((member) => member.id !== currentCharacter.id && member.role !== 'bard')
      if (buffTarget) {
        nextPendingBoost *= 2
        nextLog.push(`${currentCharacter.name} inspired ${buffTarget.name}. Next attack multiplier is x${nextPendingBoost}.`)
      } else {
        nextLog.push(`${currentCharacter.name} played an inspiring tune, but there was no ally to buff.`)
      }
    } else {
      const boostedAttack = Math.max(1, Math.round(currentCharacter.attack * nextPendingBoost))
      const result = evaluateWord(typedWord, battle.targetWord, boostedAttack)
      updatedEnemyHp = Math.max(0, battle.enemyHp - result.damage)
      const outcomeText = result.outcome === 'full'
        ? `${currentCharacter.name} scored a full hit for ${result.damage} damage.`
        : result.outcome === 'partial'
          ? `${currentCharacter.name} scored a partial hit for ${result.damage} damage.`
          : `${currentCharacter.name} missed.`
      nextLog.push(`${currentCharacter.name} spoke “${typedWord}” → ${outcomeText}`)

      if (isWitch && result.damage > 0) {
        const addedPoison = result.outcome === 'full' ? 3 : 1
        nextPoisonDamage += addedPoison
        nextPoisonTurns = Math.max(nextPoisonTurns, 3)
        nextLog.push(`${currentCharacter.name} poisoned the enemy (+${addedPoison} poison).`)
      }

      nextPendingBoost = 1
    }

    if (updatedEnemyHp <= 0) {
      const reward = getTileCoinReward(battle.tileKey)
      setGameState((current) => ({
        ...applyMissionProgress({
          ...current,
          coins: current.coins + reward,
          capturedTiles: [...new Set([...current.capturedTiles, battle.tileKey])],
        }, { tilesCaptured: 1 }),
      }))
      setBattleState(null)
      speakLessonMessage(`Great job! You captured the tile and earned ${reward} coins.`)
      setStatusMessage(`Victory! ${battle.tileKey} is now captured.`)
      return
    }

    const nextTurnIndex = battle.turnIndex + 1
    if (nextTurnIndex >= livingParty.length) {
      let enemyHpAfterPoison = updatedEnemyHp
      let poisonTurnsAfterTick = nextPoisonTurns

      if (nextPoisonDamage > 0 && nextPoisonTurns > 0) {
        enemyHpAfterPoison = Math.max(0, updatedEnemyHp - nextPoisonDamage)
        poisonTurnsAfterTick = nextPoisonTurns - 1
        nextLog = [...nextLog, `Poison dealt ${nextPoisonDamage} damage.`]
      }

      if (enemyHpAfterPoison <= 0) {
        const reward = getTileCoinReward(battle.tileKey)
        setGameState((current) => ({
          ...applyMissionProgress({
            ...current,
            coins: current.coins + reward,
            capturedTiles: [...new Set([...current.capturedTiles, battle.tileKey])],
          }, { tilesCaptured: 1 }),
        }))
        setBattleState(null)
        speakLessonMessage(`Great job! You captured the tile and earned ${reward} coins.`)
        setStatusMessage(`Victory! ${battle.tileKey} is now captured.`)
        return
      }

      const enemyDamage = Math.max(1, battle.enemyAttack)
      const updatedParty = battle.party.map((member) => ({ ...member }))
      const livingMembers = updatedParty.filter((member) => member.hp > 0)
      const targetMember = livingMembers[Math.floor(Math.random() * livingMembers.length)]
      if (targetMember) {
        targetMember.hp = Math.max(0, targetMember.hp - enemyDamage)
      }
      const turnEndLog = [...nextLog, `Enemy struck ${targetMember?.name || 'the party'} for ${enemyDamage} damage.`]

      if (updatedParty.every((member) => member.hp <= 0)) {
        setBattleState(null)
        setStatusMessage('The enemy defeated your party. The tile remains uncaptured.')
        return
      }

      setBattleState({
        ...battle,
        enemyHp: enemyHpAfterPoison,
        party: updatedParty,
        round: battle.round + 1,
        turnIndex: 0,
        log: turnEndLog,
        pendingBoost: nextPendingBoost,
        poisonDamage: nextPoisonDamage,
        poisonTurns: poisonTurnsAfterTick,
        targetWord: WORD_POOL[Math.floor(Math.random() * WORD_POOL.length)],
        status: 'waitingForInput',
      })
      speakLessonMessage('Nice try. Keep going!')
      return
    }

    setBattleState({
      ...battle,
      enemyHp: updatedEnemyHp,
      turnIndex: nextTurnIndex,
      log: nextLog,
      pendingBoost: nextPendingBoost,
      poisonDamage: nextPoisonDamage,
      poisonTurns: nextPoisonTurns,
      targetWord: WORD_POOL[Math.floor(Math.random() * WORD_POOL.length)],
      status: 'waitingForInput',
    })
    speakLessonMessage('Nice try. Keep going!')
  }

  const toggleBuildMode = () => {
    setBuildMode((current) => {
      const next = !current
      setStatusMessage(next ? 'Building mode is active. Select a building and place it on a captured tile.' : 'Battle mode is active. Click an uncaptured tile to fight for it.')
      return next
    })
    setSelectedBuilding(null)
  }

  const resetProgress = () => {
    const fresh = createInitialGameState()
    setGameState(fresh)
    setBattleState(null)
    setPendingBattle(null)
    setBuildMode(false)
    setSelectedBuilding(null)
    setSelectedCharacter(fresh.party[0]?.id || null)
    setSelectedGeneratorTile(null)
    setShowPartyEditor(false)
    setShowMissions(false)
    setTutorialStep(null)
    setTutorialTileKey(null)
    setTutorialDismissedInStartState(false)
    setStatusMessage('Progress reset for testing.')
    setNextEnergyRefreshAt(Date.now() + 60000)
    setEnergyRefreshSeconds(60)
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('practiceGameState')
    }
  }

  const addPartyMember = (role) => {
    setGameState((current) => {
      const { nextState, added } = addCharacterToParty(current, role)
      if (added) {
        setSelectedCharacter(added.id)
        setStatusMessage(`${added.name} joined your party.`)
      } else {
        setStatusMessage(`Party is full. Max ${MAX_PARTY_SIZE} characters.`)
      }
      return nextState
    })
  }

  const removePartyMember = (memberId) => {
    setGameState((current) => {
      if (current.party.length <= 1) {
        setStatusMessage('At least one character must remain in the party.')
        return current
      }

      const removed = current.party.find((member) => member.id === memberId)
      const nextParty = current.party.filter((member) => member.id !== memberId)
      if (!removed) {
        return current
      }

      if (selectedCharacter === memberId) {
        setSelectedCharacter(nextParty[0]?.id || null)
      }
      setStatusMessage(`${removed.name} was removed from your party.`)

      return {
        ...current,
        party: nextParty,
      }
    })
  }

  const selectedMember = gameState.party.find((member) => member.id === selectedCharacter) || gameState.party[0] || null
  const selectedRole = selectedMember?.role || 'scout'
  const trainingName = `${getPossessiveRole(selectedRole)} training ground`
  const shelterName = `${getPossessiveRole(selectedRole)} shelter`

  const additionalBanks = getAdditionalBankCount(gameState.buildings)
  const additionalGenerators = getAdditionalGeneratorCount(gameState.buildings)
  const nextBankUnlockTiles = (additionalBanks + 1) * 10
  const nextGeneratorUnlockTiles = (additionalGenerators + 1) * 30

  const buildingDefinitions = [
    {
      key: 'bank',
      name: 'Bank',
      unlock: nextBankUnlockTiles,
      cost: BANK_BUILD_COST,
      maxCount: Infinity,
      description: 'Adds 300 storage for generated money.',
      effect: `Next bank unlock: ${nextBankUnlockTiles} extra captured tiles.`,
      lockLabel: `Locked: requires ${nextBankUnlockTiles} extra captured tiles.`,
    },
    {
      key: 'generator',
      name: 'Generator',
      unlock: nextGeneratorUnlockTiles,
      cost: GENERATOR_BUILD_COST,
      maxCount: Infinity,
      description: 'Generates money over time like the old bank.',
      effect: `Next generator unlock: ${nextGeneratorUnlockTiles} extra captured tiles.`,
      lockLabel: `Locked: requires ${nextGeneratorUnlockTiles} extra captured tiles.`,
    },
    {
      key: 'house',
      name: 'House',
      unlock: 0,
      cost: 150,
      maxCount: Infinity,
      description: 'Builds a villager home.',
      effect: 'Adds a Villager (max party 4).',
    },
    {
      key: 'hut',
      name: 'Hut',
      unlock: 5,
      cost: 180,
      maxCount: Infinity,
      description: 'Mystic dwelling for witches.',
      effect: 'Adds a Witch (poison attacks).',
      lockLabel: 'Locked: requires witch unlock (5 extra captured tiles).',
    },
    {
      key: 'cottage',
      name: 'Cottage',
      unlock: 10,
      cost: 180,
      maxCount: Infinity,
      description: 'A quiet home for performers.',
      effect: 'Adds a Bard (stacks ally damage buffs).',
      lockLabel: 'Locked: requires bard unlock (10 extra captured tiles).',
    },
    {
      key: 'training',
      name: trainingName,
      unlock: 3,
      cost: 220,
      maxCount: Infinity,
      description: 'Upgrades one character attack by +5.',
      effect: 'Requires 3 captured tiles.',
    },
    {
      key: 'shelter',
      name: shelterName,
      unlock: 5,
      cost: 300,
      maxCount: Infinity,
      description: 'Upgrades one character max HP by +15 and restores them.',
      effect: 'Requires 5 captured tiles.',
    },
  ]

  const emptyCapturedTiles = useMemo(() => gameState.capturedTiles.filter((tileKey) => !gameState.buildings[tileKey]), [gameState.capturedTiles, gameState.buildings])
  const battleEnemyHpPercent = battleState ? Math.max(0, (battleState.enemyHp / battleState.enemyMaxHp) * 100) : 100
  const livingParty = battleState ? battleState.party.filter((member) => member.hp > 0) : []
  const activeBattleCharacter = battleState ? livingParty[battleState.turnIndex] : null
  const energyRefreshLabel = `${Math.floor(Math.max(0, energyRefreshSeconds) / 60)}:${String(Math.max(0, energyRefreshSeconds) % 60).padStart(2, '0')}`
  const newTileCount = Math.max(0, gameState.capturedTiles.length - 16)
  const totalBankCount = getTotalBankCount(gameState.buildings)
  const totalGeneratorCount = getTotalGeneratorCount(gameState.buildings)
  const bankCapacity = getBankCapacity(gameState.buildings)
  const generatorCapacity = getGeneratorCapacity(gameState.buildings)
  const generatorPerMinute = totalGeneratorCount
  const bankCountdownSeconds = gameState.generator
    ? Math.max(0, Math.ceil((gameState.generator.nextCoinAt - Date.now()) / 1000))
    : 0
  const bankCountdownLabel = bankCapacity <= 0
    ? 'Build a bank to store money'
    : (gameState.generator?.coins || 0) >= generatorCapacity
      ? 'Generator full'
      : bankCountdownSeconds <= 0
        ? 'Next payout ready now'
        : `Next payout in ${bankCountdownSeconds}s`
  const missionsState = buildMissionsState(gameState.missions)
  const completedMissionCount = missionsState.items.filter((entry) => entry.completed && !entry.claimed).length

  const collectBankCoins = () => {
    if (!gameState.generator || gameState.generator.coins <= 0) {
      setStatusMessage('Generator has no coins to collect right now.')
      return
    }

    if (!gameState.bank) {
      setStatusMessage('No bank is available to store coins.')
      return
    }

    const remainingBankSpace = Math.max(0, bankCapacity - gameState.bank.coins)
    if (remainingBankSpace <= 0) {
      setStatusMessage('Bank storage is full. Build more banks first.')
      return
    }

    const transferAmount = Math.min(gameState.generator.coins, remainingBankSpace)

    const collectedAmount = transferAmount
    setGameState((current) => ({
      ...current,
      coins: current.coins + collectedAmount,
      bank: {
        ...current.bank,
        coins: Math.min(getBankCapacity(current.buildings), current.bank.coins + collectedAmount),
        capacity: getBankCapacity(current.buildings),
      },
      generator: {
        ...current.generator,
        coins: Math.max(0, current.generator.coins - collectedAmount),
        capacity: getGeneratorCapacity(current.buildings),
      },
    }))
    setSelectedGeneratorTile(null)
    setStatusMessage(`Transferred ${collectedAmount} coins from generator to bank storage.`)
  }

  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
  const getAnchorRect = (ref) => {
    if (!ref?.current) {
      return null
    }

    const rect = ref.current.getBoundingClientRect()
    return {
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
    }
  }

  const energyAnchor = getAnchorRect(energyChipRef)
  const economyAnchor = getAnchorRect(economyChipRef)
  const buildAnchor = getAnchorRect(buildButtonRef)
  const partyAnchor = getAnchorRect(partyButtonRef)
  const missionsAnchor = getAnchorRect(missionsButtonRef)

  return (
    <div style={{ position: 'fixed', inset: 0, margin: 0, padding: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 20, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div ref={energyChipRef} style={{ padding: '10px 14px', borderRadius: 999, background: 'rgba(15, 23, 42, 0.85)', color: 'white', fontWeight: 700 }}>
            Energy: {gameState.energy}/{MAX_ENERGY}
            <div style={{ fontSize: 12, marginTop: 2, opacity: 0.8 }}>Refresh in {energyRefreshLabel}</div>
          </div>
          <div ref={economyChipRef} style={{ padding: '10px 14px', borderRadius: 999, background: 'rgba(15, 23, 42, 0.85)', color: 'white', fontWeight: 700 }}>
            Coins: {gameState.coins}/{bankCapacity}
            <div style={{ fontSize: 12, marginTop: 2, opacity: 0.8 }}>Banks {totalBankCount} · Generators {totalGeneratorCount}</div>
          </div>
        </div>

        <div
          onMouseEnter={() => setShowStatsMenu(true)}
          onMouseLeave={() => setShowStatsMenu(false)}
          style={{ position: 'relative' }}
        >
          <button
            style={{ padding: '10px 14px', borderRadius: 999, border: 'none', background: showStatsMenu ? '#1d4ed8' : '#2563eb', color: 'white', fontWeight: 700, cursor: 'pointer' }}
          >
            Stats
          </button>
          {showStatsMenu && (
            <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, minWidth: 220, padding: 12, borderRadius: 16, background: 'rgba(15, 23, 42, 0.96)', color: 'white', boxShadow: '0 14px 40px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>City stats</div>
              <div style={{ fontSize: 13, opacity: 0.9 }}>Captured tiles: {gameState.capturedTiles.length}</div>
              <div style={{ fontSize: 13, opacity: 0.9 }}>Empty captured tiles: {emptyCapturedTiles.length}</div>
              <div style={{ fontSize: 13, opacity: 0.9 }}>Coins: {gameState.coins}</div>
              <div style={{ fontSize: 13, opacity: 0.9 }}>Stored coins: {gameState.bank?.coins || 0}/{bankCapacity}</div>
              <div style={{ fontSize: 13, opacity: 0.9 }}>Generator held: {gameState.generator?.coins || 0}/{generatorCapacity}</div>
              <div style={{ fontSize: 13, opacity: 0.9 }}>Generator output: {generatorPerMinute} per minute</div>
              <div style={{ fontSize: 13, opacity: 0.9 }}>Banks: {totalBankCount} · Generators: {totalGeneratorCount}</div>
              <div style={{ fontSize: 13, opacity: 0.9 }}>Party size: {gameState.party.length}/{MAX_PARTY_SIZE}</div>
              <button
                onClick={resetProgress}
                style={{ marginTop: 6, padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(248,113,113,0.55)', background: 'rgba(127,29,29,0.35)', color: '#fecaca', fontWeight: 700, cursor: 'pointer' }}
              >
                Reset progress
              </button>
              <div style={{ fontSize: 12, color: '#bfdbfe', marginTop: 4 }}>{statusMessage}</div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
          <button
            ref={buildButtonRef}
            onClick={toggleBuildMode}
            style={{ padding: '10px 14px', borderRadius: 999, border: 'none', background: buildMode ? '#f59e0b' : '#2563eb', color: 'white', fontWeight: 700, cursor: 'pointer' }}
          >
            {buildMode ? 'Exit Build Mode' : 'Build Mode'}
          </button>
          <button
            ref={partyButtonRef}
            onClick={() => setShowPartyEditor((current) => !current)}
            style={{ padding: '10px 14px', borderRadius: 999, border: 'none', background: showPartyEditor ? '#f59e0b' : '#334155', color: 'white', fontWeight: 700, cursor: 'pointer' }}
          >
            {showPartyEditor ? 'Close Party' : 'Add Party'}
          </button>
          <div style={{ position: 'relative' }}>
            <button
              ref={missionsButtonRef}
              onClick={() => setShowMissions((current) => !current)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 999, border: 'none', background: showMissions ? '#f59e0b' : '#1f2937', color: 'white', fontWeight: 700, cursor: 'pointer' }}
            >
              Missions
            </button>
            {completedMissionCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 8,
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: '#ef4444',
                  boxShadow: '0 0 0 2px rgba(15, 23, 42, 0.9)',
                }}
              />
            )}
          </div>

          {showMissions && (
            <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 340, padding: 12, borderRadius: 16, background: 'rgba(15, 23, 42, 0.96)', color: 'white', boxShadow: '0 14px 40px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontWeight: 800 }}>Daily Missions</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>Day {missionsState.dayIndex} · Resets daily · {MISSION_REWARD_COINS} coins each</div>
              {missionsState.items.map((mission) => {
                const canClaim = mission.completed && !mission.claimed
                return (
                  <div key={mission.id} style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontWeight: 700 }}>{mission.title}</div>
                      <div style={{ fontSize: 12, color: mission.claimed ? '#86efac' : mission.completed ? '#fca5a5' : '#cbd5e1' }}>
                        {mission.claimed ? 'Claimed' : mission.completed ? 'Complete' : 'In progress'}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{mission.description}</div>
                    <div style={{ fontSize: 12, marginTop: 8 }}>{mission.progress}/{mission.target}</div>
                    <div style={{ height: 8, borderRadius: 999, background: 'rgba(148,163,184,0.35)', overflow: 'hidden', marginTop: 6 }}>
                      <div style={{ width: `${Math.min(100, (mission.progress / mission.target) * 100)}%`, height: '100%', background: mission.completed ? '#22c55e' : '#38bdf8' }} />
                    </div>
                    <button
                      onClick={() => claimMissionReward(mission.id)}
                      disabled={!canClaim}
                      style={{ marginTop: 10, padding: '7px 10px', borderRadius: 999, border: 'none', background: canClaim ? '#dc2626' : '#475569', color: 'white', fontWeight: 700, cursor: canClaim ? 'pointer' : 'not-allowed', opacity: canClaim ? 1 : 0.7 }}
                    >
                      Claim {MISSION_REWARD_COINS}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {showPartyEditor && (
        <div style={{ position: 'absolute', top: 132, right: 16, zIndex: 25, width: 320, background: 'rgba(15, 23, 42, 0.95)', color: 'white', borderRadius: 18, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
          <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 10 }}>Party Manager</div>
          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 10 }}>Manage your team (max {MAX_PARTY_SIZE}).</div>
          <div style={{ maxHeight: 160, overflowY: 'auto', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {gameState.party.map((member) => (
              <div key={member.id} style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{member.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.85 }}>{member.role} · ATK {member.attack} · HP {member.hp}/{member.maxHp}</div>
                </div>
                <button
                  onClick={() => removePartyMember(member.id)}
                  disabled={gameState.party.length <= 1}
                  style={{ padding: '6px 10px', borderRadius: 999, border: 'none', background: gameState.party.length <= 1 ? '#475569' : '#7f1d1d', color: '#fee2e2', fontWeight: 700, cursor: gameState.party.length <= 1 ? 'not-allowed' : 'pointer' }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button onClick={() => addPartyMember('scout')} disabled={gameState.party.length >= MAX_PARTY_SIZE} style={{ padding: '8px 10px', borderRadius: 10, border: 'none', background: '#1d4ed8', color: 'white', fontWeight: 700, cursor: gameState.party.length >= MAX_PARTY_SIZE ? 'not-allowed' : 'pointer', opacity: gameState.party.length >= MAX_PARTY_SIZE ? 0.6 : 1 }}>Add Scout</button>
            <button onClick={() => addPartyMember('villager')} disabled={gameState.party.length >= MAX_PARTY_SIZE} style={{ padding: '8px 10px', borderRadius: 10, border: 'none', background: '#1d4ed8', color: 'white', fontWeight: 700, cursor: gameState.party.length >= MAX_PARTY_SIZE ? 'not-allowed' : 'pointer', opacity: gameState.party.length >= MAX_PARTY_SIZE ? 0.6 : 1 }}>Add Villager</button>
            <button onClick={() => addPartyMember('witch')} disabled={gameState.party.length >= MAX_PARTY_SIZE} style={{ padding: '8px 10px', borderRadius: 10, border: 'none', background: '#7c3aed', color: 'white', fontWeight: 700, cursor: gameState.party.length >= MAX_PARTY_SIZE ? 'not-allowed' : 'pointer', opacity: gameState.party.length >= MAX_PARTY_SIZE ? 0.6 : 1 }}>Add Witch</button>
            <button onClick={() => addPartyMember('bard')} disabled={gameState.party.length >= MAX_PARTY_SIZE} style={{ padding: '8px 10px', borderRadius: 10, border: 'none', background: '#0f766e', color: 'white', fontWeight: 700, cursor: gameState.party.length >= MAX_PARTY_SIZE ? 'not-allowed' : 'pointer', opacity: gameState.party.length >= MAX_PARTY_SIZE ? 0.6 : 1 }}>Add Bard</button>
          </div>
        </div>
      )}

      {selectedGeneratorTile && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 35, background: 'rgba(2, 6, 23, 0.76)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: 'min(92vw, 520px)', background: 'linear-gradient(135deg, #1d4ed8 0%, #111827 100%)', borderRadius: 24, color: 'white', padding: 24, boxShadow: '0 22px 60px rgba(0,0,0,0.35)' }}>
            <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Generator</div>
            <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 16 }}>Generators fill their own storage by 1 coin per minute each, then transfer to banks when collected.</div>
            <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: 14, marginBottom: 16 }}>
              <div style={{ fontWeight: 700 }}>Generator storage</div>
              <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>{gameState.generator?.coins || 0}/{generatorCapacity}</div>
              <div style={{ fontSize: 13, opacity: 0.9, marginTop: 8 }}>Output rate: {generatorPerMinute} coin/min</div>
              <div style={{ fontSize: 13, opacity: 0.9, marginTop: 8 }}>Bank storage: {gameState.bank?.coins || 0}/{bankCapacity}</div>
              <div style={{ fontSize: 13, opacity: 0.9, marginTop: 8 }}>{bankCountdownLabel}</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={collectBankCoins} style={{ flex: 1, padding: '10px 12px', borderRadius: 999, border: 'none', background: '#f59e0b', color: 'white', fontWeight: 800, cursor: 'pointer' }}>
                Collect coins
              </button>
              <button onClick={() => setSelectedGeneratorTile(null)} style={{ flex: 1, padding: '10px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.35)', background: 'transparent', color: 'white', fontWeight: 700, cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingBattle && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 35, background: 'rgba(2, 6, 23, 0.76)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: 'min(92vw, 760px)', background: 'linear-gradient(135deg, #1d4ed8 0%, #111827 100%)', borderRadius: 24, color: 'white', padding: 24, boxShadow: '0 22px 60px rgba(0,0,0,0.35)' }}>
            <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Prepare for battle</div>
            <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 16 }}>Your party will face this tile’s guardian. Review the setup before you commit.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Party</div>
                {pendingBattle.party.map((member) => (
                  <div key={member.id} style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.12)', marginBottom: 8 }}>
                    <div style={{ fontWeight: 700 }}>{member.name}</div>
                    <div style={{ fontSize: 13, opacity: 0.9 }}>{member.hp}/{member.maxHp} HP · Attack {member.attack} · {member.role}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Words in play</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {pendingBattle.wordsInPlay.map((word) => (
                    <div key={word} style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 999, padding: '6px 10px', fontWeight: 700 }}>{word}</div>
                  ))}
                </div>
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.18)' }}>
                  <div style={{ fontWeight: 700 }}>Enemy</div>
                  <div style={{ fontSize: 13, opacity: 0.9 }}>{pendingBattle.encounterConfig.name} · {pendingBattle.encounterConfig.hp} HP · Attack {pendingBattle.encounterConfig.attack}</div>
                  <div style={{ fontWeight: 700, marginTop: 10 }}>Energy cost</div>
                  <div style={{ fontSize: 13, opacity: 0.9 }}>{pendingBattle.energyCost} energy</div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button onClick={beginBattle} style={{ flex: 1, padding: '10px 12px', borderRadius: 999, border: 'none', background: '#f59e0b', color: 'white', fontWeight: 800, cursor: 'pointer' }}>
                Start battle
              </button>
              <button onClick={() => setPendingBattle(null)} disabled={Boolean(pendingBattle.tutorialGuaranteed)} style={{ padding: '10px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.35)', background: 'transparent', color: 'white', fontWeight: 700, cursor: pendingBattle.tutorialGuaranteed ? 'not-allowed' : 'pointer', opacity: pendingBattle.tutorialGuaranteed ? 0.65 : 1 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {battleState && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(2, 6, 23, 0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ position: 'relative', width: 'min(96vw, 1100px)', height: 'min(84vh, 760px)', background: 'linear-gradient(135deg, #111827 0%, #1d4ed8 100%)', borderRadius: 24, color: 'white', overflow: 'hidden', boxShadow: '0 22px 60px rgba(0,0,0,0.35)' }}>
            <Canvas style={{ width: '100%', height: '100%' }} camera={{ position: [0, 4, 8], fov: 50 }}>
              <ambientLight intensity={0.7} />
              <directionalLight position={[4, 6, 4]} intensity={1.1} />
              <BattleScene />
              <OrbitControls enablePan={false} enableZoom={false} maxPolarAngle={Math.PI / 2.05} />
            </Canvas>

            <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 35, background: 'rgba(15, 23, 42, 0.82)', borderRadius: 16, padding: 14, minWidth: 280 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Party</div>
              {battleState.party.map((member) => {
                const hpPercent = Math.max(0, (member.hp / member.maxHp) * 100)
                const isActive = activeBattleCharacter?.id === member.id

                return (
                  <div key={member.id} style={{ padding: '8px 10px', borderRadius: 10, background: isActive ? 'rgba(59, 130, 246, 0.34)' : 'rgba(255,255,255,0.12)', marginBottom: 8, border: isActive ? '1px solid rgba(147,197,253,0.8)' : '1px solid transparent' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontWeight: 700 }}>{member.name}</div>
                      <div style={{ fontSize: 12, opacity: 0.9 }}>{member.hp}/{member.maxHp} HP</div>
                    </div>
                    <div style={{ height: 8, background: 'rgba(255,255,255,0.16)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${hpPercent}%`, background: member.hp > 0 ? '#22c55e' : '#64748b' }} />
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.9, marginTop: 6 }}>Attack {member.attack} · {member.role}</div>
                  </div>
                )
              })}
            </div>

            <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 35, background: 'rgba(15, 23, 42, 0.82)', borderRadius: 16, padding: 14, minWidth: 280 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Enemy</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontWeight: 700 }}>{battleState.enemyName}</div>
                <div style={{ fontSize: 12, opacity: 0.9 }}>{battleState.enemyHp}/{battleState.enemyMaxHp} HP</div>
              </div>
              <div style={{ height: 8, background: 'rgba(255,255,255,0.16)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${battleEnemyHpPercent}%`, background: '#fbbf24' }} />
              </div>
              <div style={{ fontSize: 12, opacity: 0.9, marginTop: 6 }}>Attack {battleState.enemyAttack} · {battleState.enemyCount > 1 ? `${battleState.enemyCount} foes` : 'Single foe'}</div>
            </div>

            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 35, background: 'rgba(15, 23, 42, 0.82)', borderRadius: 18, padding: '14px 20px', minWidth: 320, textAlign: 'center' }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.2em', opacity: 0.8 }}>Say this word</div>
              <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{battleState.targetWord}</div>
              <div style={{ fontSize: 13, marginTop: 6, opacity: 0.9 }}>Tile difficulty: {battleState.difficulty} · Active turn: {activeBattleCharacter?.name || 'None'}</div>
            </div>

            <div style={{ position: 'absolute', left: 20, bottom: 20, zIndex: 35, width: 'min(320px, 70vw)' }}>
              <div style={{ background: 'rgba(15, 23, 42, 0.82)', borderRadius: 16, padding: 14, marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Battle log</div>
                <div style={{ maxHeight: 140, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {battleState.log.slice(-5).map((entry, index) => (
                    <div key={`${entry}-${index}`} style={{ fontSize: 13, background: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 10px' }}>
                      {entry}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={startListening} disabled={isListening} style={{ flex: 1, padding: '10px 12px', borderRadius: 999, border: 'none', background: '#eff6ff', color: '#1d4ed8', fontWeight: 800, cursor: 'pointer' }}>
                  {isListening ? 'Listening…' : 'Speak word'}
                </button>
                <button onClick={() => setBattleState(null)} disabled={Boolean(battleState.tutorialGuaranteed)} style={{ padding: '10px 12px', borderRadius: 999, border: 'none', background: 'rgba(255,255,255,0.18)', color: 'white', fontWeight: 700, cursor: battleState.tutorialGuaranteed ? 'not-allowed' : 'pointer', opacity: battleState.tutorialGuaranteed ? 0.65 : 1 }}>
                  Exit
                </button>
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: '#bfdbfe' }}>
                Pronunciation-only mode: use the Speak word button each turn.
              </div>
            </div>
          </div>
        </div>
      )}

      {buildMode && (
        <div style={{ position: 'absolute', top: 90, right: 16, zIndex: 20, width: 300, maxHeight: '72vh', overflowY: 'auto', background: 'rgba(15, 23, 42, 0.95)', color: 'white', borderRadius: 18, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 10 }}>Buildings</div>
          {buildingDefinitions.map((building) => {
            const tutorialHouseOnly = tutorialStep === 4 && building.key !== 'house'
            const unlocked = !tutorialHouseOnly && newTileCount >= building.unlock
            const active = selectedBuilding === building.key
            const lockReason = tutorialHouseOnly
              ? 'Tutorial: build a House first.'
              : (building.lockLabel || `Locked: requires ${building.unlock} extra captured tiles.`)
            return (
              <button
                key={building.key}
                onClick={() => setSelectedBuilding(active ? null : building.key)}
                disabled={!unlocked}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  marginBottom: 8,
                  padding: 12,
                  borderRadius: 12,
                  border: active ? '2px solid #f59e0b' : '1px solid rgba(255,255,255,0.15)',
                  background: unlocked ? (active ? '#1d4ed8' : '#0f172a') : '#475569',
                  color: 'white',
                  cursor: unlocked ? 'pointer' : 'not-allowed',
                  opacity: unlocked ? 1 : 0.75,
                }}
              >
                <div style={{ fontWeight: 700 }}>{building.name}</div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>{building.description}</div>
                <div style={{ fontSize: 12, marginTop: 4, color: '#bfdbfe' }}>{building.effect}</div>
                <div style={{ fontSize: 12, marginTop: 4, color: '#fef3c7' }}>Cost: {building.cost} coins</div>
                {!unlocked && <div style={{ fontSize: 12, marginTop: 4, color: '#fecaca' }}>{lockReason}</div>}
              </button>
            )
          })}

          <div style={{ marginTop: 10 }}>
            <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>Target character</label>
            <select value={selectedCharacter || ''} onChange={(event) => setSelectedCharacter(event.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 10 }}>
              {gameState.party.map((member) => (
                <option key={member.id} value={member.id}>{member.name} ({member.role})</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <Canvas style={{ width: '100%', height: '100%' }} camera={{ position: [0, 8, 12], fov: 60 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 10, 5]} intensity={1} />
        <PlaneScene
          capturedTiles={gameState.capturedTiles}
          buildings={gameState.buildings}
          buildMode={buildMode}
          selectedBuilding={selectedBuilding}
          hoveredTileKey={hoveredTileKey}
          onTileHover={setHoveredTileKey}
          onTileClick={handleTileClick}
          tutorialTileKey={tutorialTileKey}
          showTutorialTileGuide={isTutorialCaptureStep}
        />
        <OrbitControls />
      </Canvas>

      {tutorialStep !== null && (
        <>
          {tutorialStep !== 1 && tutorialStep !== 4 && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(2, 6, 23, 0.66)', zIndex: 40, pointerEvents: 'none' }} />
          )}

          {tutorialStep === 0 && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 45, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              <div style={{ width: 'min(94vw, 680px)', background: 'linear-gradient(135deg, #1d4ed8 0%, #0f172a 100%)', color: 'white', borderRadius: 24, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
                <div style={{ fontSize: 26, fontWeight: 900, marginBottom: 10 }}>Welcome to Practice Game</div>
                <div style={{ fontSize: 15, opacity: 0.94, lineHeight: 1.5, marginBottom: 12 }}>
                  This is a game to practice your pronunciation. You will capture tiles by speaking words and improve your team over time.
                </div>
                <div style={{ fontSize: 14, color: '#bfdbfe', marginBottom: 18 }}>
                  We will guide you through your first capture, then show the core UI elements.
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button
                    onClick={() => {
                      setTutorialStep(1)
                      setStatusMessage('Tutorial: capture the highlighted tile. You cannot fail this first one.')
                    }}
                    style={{ padding: '10px 14px', borderRadius: 999, border: 'none', background: '#f59e0b', color: 'white', fontWeight: 800, cursor: 'pointer', pointerEvents: 'auto' }}
                  >
                    Start Tutorial
                  </button>
                </div>
              </div>
            </div>
          )}

          {tutorialStep === 1 && (
            <div style={{ position: 'absolute', left: 24, bottom: 24, zIndex: 45, width: 'min(90vw, 460px)', background: 'rgba(15, 23, 42, 0.97)', color: 'white', borderRadius: 18, padding: 16, pointerEvents: 'auto', boxShadow: '0 14px 40px rgba(0,0,0,0.35)' }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Step 1: Capture your first tile</div>
              <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.45 }}>
                Click the highlighted tutorial tile, start the battle, and say/type the target word each turn.
                If your party is defeated, their HP is magically regenerated so this first tutorial capture cannot fail.
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: '#fef08a' }}>
                Look for the glowing ring labeled Tutorial Tile on the map.
              </div>
            </div>
          )}

          {tutorialStep === 2 && (
            <>
              <div style={{ position: 'absolute', top: clamp(energyAnchor?.centerY ?? 52, 12, viewportHeight - 24), left: clamp(energyAnchor?.centerX ?? 220, 12, viewportWidth - 12), transform: 'translate(-50%, -50%)', zIndex: 45, color: '#fef08a', fontWeight: 800, fontSize: 13, pointerEvents: 'none' }}>◀ Energy and refresh</div>

              <div style={{ position: 'absolute', top: clamp((energyAnchor?.bottom ?? 96) + 10, 24, viewportHeight - 260), left: clamp(energyAnchor?.left ?? 24, 24, viewportWidth - 450), zIndex: 45, width: 'min(90vw, 420px)', background: 'rgba(15, 23, 42, 0.97)', color: 'white', borderRadius: 18, padding: 16, pointerEvents: 'auto', boxShadow: '0 14px 40px rgba(0,0,0,0.35)' }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Step 2: Energy and refresh</div>
                <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.45 }}>
                  Battles use energy. Your energy refills automatically over time, and the timer shows when the next energy point arrives.
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                  <button
                    onClick={() => {
                      setTutorialStep(3)
                      setStatusMessage('Energy understood. Next: coins, banks, and generators.')
                    }}
                    style={{ padding: '10px 14px', borderRadius: 999, border: 'none', background: '#f59e0b', color: 'white', fontWeight: 800, cursor: 'pointer' }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}

          {tutorialStep === 3 && (
            <>
              <div style={{ position: 'absolute', top: clamp(economyAnchor?.centerY ?? 52, 12, viewportHeight - 24), left: clamp(economyAnchor?.centerX ?? 320, 12, viewportWidth - 12), transform: 'translate(-50%, -50%)', zIndex: 45, color: '#fef08a', fontWeight: 800, fontSize: 13, pointerEvents: 'none' }}>◀ Coins, banks, generators</div>

              <div style={{ position: 'absolute', top: clamp((economyAnchor?.bottom ?? 96) + 10, 24, viewportHeight - 260), left: clamp(economyAnchor?.left ?? 24, 24, viewportWidth - 460), zIndex: 45, width: 'min(90vw, 430px)', background: 'rgba(15, 23, 42, 0.97)', color: 'white', borderRadius: 18, padding: 16, pointerEvents: 'auto', boxShadow: '0 14px 40px rgba(0,0,0,0.35)' }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Step 3: Coins, banks, generators</div>
                <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.45 }}>
                  Generators slowly create coins. Banks define your maximum storage capacity.
                  The main coin display shows current stored coins over total bank capacity.
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                  <button
                    onClick={() => {
                      setTutorialStep(4)
                      setStatusMessage('Now build your first House to recruit a villager.')
                    }}
                    style={{ padding: '10px 14px', borderRadius: 999, border: 'none', background: '#f59e0b', color: 'white', fontWeight: 800, cursor: 'pointer' }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}

          {tutorialStep === 4 && (
            <>
              <div style={{ position: 'absolute', top: clamp(buildAnchor?.centerY ?? 92, 12, viewportHeight - 24), left: clamp(buildAnchor?.centerX ?? (viewportWidth - 130), 12, viewportWidth - 12), transform: 'translate(-50%, -50%)', zIndex: 45, color: '#fef08a', fontWeight: 800, fontSize: 13, pointerEvents: 'none' }}>▲ Build Mode</div>

              <div style={{ position: 'absolute', left: 24, bottom: 24, zIndex: 45, width: 'min(90vw, 460px)', background: 'rgba(15, 23, 42, 0.97)', color: 'white', borderRadius: 18, padding: 16, pointerEvents: 'auto', boxShadow: '0 14px 40px rgba(0,0,0,0.35)' }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Step 4: Build your first house</div>
                <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.45 }}>
                  Open Build Mode, select House, then click a captured empty tile to place it.
                  This tutorial step only allows House so you can recruit your first villager.
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                  <button
                    onClick={() => {
                      setBuildMode(true)
                      setSelectedBuilding('house')
                      setStatusMessage('Tutorial: place a House on a captured tile.')
                    }}
                    style={{ padding: '10px 14px', borderRadius: 999, border: 'none', background: '#f59e0b', color: 'white', fontWeight: 800, cursor: 'pointer' }}
                  >
                    Select House
                  </button>
                </div>
              </div>
            </>
          )}

          {tutorialStep === 5 && (
            <>
              <div style={{ position: 'absolute', top: clamp(partyAnchor?.centerY ?? 128, 12, viewportHeight - 24), left: clamp(partyAnchor?.centerX ?? (viewportWidth - 130), 12, viewportWidth - 12), transform: 'translate(-50%, -50%)', zIndex: 45, color: '#fef08a', fontWeight: 800, fontSize: 13, pointerEvents: 'none' }}>▲ Add Party</div>

              <div style={{ position: 'absolute', top: clamp((partyAnchor?.bottom ?? 164) + 10, 24, viewportHeight - 260), left: clamp((partyAnchor?.left ?? 24) - 300, 24, viewportWidth - 460), zIndex: 45, width: 'min(90vw, 430px)', background: 'rgba(15, 23, 42, 0.97)', color: 'white', borderRadius: 18, padding: 16, pointerEvents: 'auto', boxShadow: '0 14px 40px rgba(0,0,0,0.35)' }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Step 5: Changing the party</div>
                <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.45 }}>
                  The Add Party menu is where you manage your team. There is nothing urgent to change right now,
                  but later you can add or remove members based on your strategy.
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                  <button
                    onClick={() => {
                      setTutorialStep(6)
                      setStatusMessage('Final step: missions for extra coins.')
                    }}
                    style={{ padding: '10px 14px', borderRadius: 999, border: 'none', background: '#f59e0b', color: 'white', fontWeight: 800, cursor: 'pointer' }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}

          {tutorialStep === 6 && (
            <>
              <div style={{ position: 'absolute', top: clamp(missionsAnchor?.centerY ?? 162, 12, viewportHeight - 24), left: clamp(missionsAnchor?.centerX ?? (viewportWidth - 130), 12, viewportWidth - 12), transform: 'translate(-50%, -50%)', zIndex: 45, color: '#fef08a', fontWeight: 800, fontSize: 13, pointerEvents: 'none' }}>▲ Missions</div>

              <div style={{ position: 'absolute', top: clamp((missionsAnchor?.bottom ?? 196) + 10, 24, viewportHeight - 260), left: clamp((missionsAnchor?.left ?? 24) - 300, 24, viewportWidth - 460), zIndex: 45, width: 'min(90vw, 430px)', background: 'rgba(15, 23, 42, 0.97)', color: 'white', borderRadius: 18, padding: 16, pointerEvents: 'auto', boxShadow: '0 14px 40px rgba(0,0,0,0.35)' }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Step 6: Missions</div>
                <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.45 }}>
                  Missions are daily objectives that reward extra coins when completed.
                  Check them often to speed up your city growth.
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                  <button
                    onClick={() => {
                      setTutorialStep(7)
                      setStatusMessage('Tutorial complete. Great work!')
                    }}
                    style={{ padding: '10px 14px', borderRadius: 999, border: 'none', background: '#f59e0b', color: 'white', fontWeight: 800, cursor: 'pointer' }}
                  >
                    Finish
                  </button>
                </div>
              </div>
            </>
          )}

          {tutorialStep === 7 && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 45, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto', padding: 24 }}>
              <div style={{ width: 'min(92vw, 560px)', background: 'rgba(15, 23, 42, 0.97)', color: 'white', borderRadius: 20, padding: 20, textAlign: 'center', boxShadow: '0 14px 40px rgba(0,0,0,0.35)' }}>
                <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>Tutorial Complete</div>
                <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 14 }}>
                  Capture more tiles, build your economy, and keep practicing pronunciation to strengthen your party.
                </div>
                <button
                  onClick={() => {
                    setTutorialStep(null)
                    setTutorialDismissedInStartState(true)
                  }}
                  style={{ padding: '10px 14px', borderRadius: 999, border: 'none', background: '#22c55e', color: '#052e16', fontWeight: 800, cursor: 'pointer' }}
                >
                  Continue Playing
                </button>
              </div>
            </div>
          )}
        </>
      )}
      <Back />
    </div>
  )
}
