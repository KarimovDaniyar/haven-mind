import { MissionDestination } from '../store/appStore';

const PLANET_COLORS: Record<MissionDestination, string> = {
  MOON: '#8A8A8A',
  MARS: '#C1440E',
  JUPITER: '#C88B3A',
  SATURN: '#D4A843',
  NEPTUNE: '#2E4482',
};

export const renderPlanetIcon = (planetName: MissionDestination, size = 18) => {
  const center = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      overflow="visible" // 🔥 фикс обрезания
      aria-hidden
    >
      {/* ================= RINGS BACK ================= */}
      {(planetName === 'SATURN' || planetName === 'NEPTUNE') && (
        <ellipse
          cx={center}
          cy={center}
          rx={size * (planetName === 'SATURN' ? 0.8 : 0.75)}
          ry={size * (planetName === 'SATURN' ? 0.28 : 0.3)}
          fill="none"
          stroke={
            planetName === 'SATURN'
              ? 'rgba(184,146,74,0.35)'
              : 'rgba(184,205,244,0.35)'
          }
          strokeWidth={size * 0.03}
          transform={`rotate(${planetName === 'SATURN' ? -20 : -15} ${center} ${center})`}
        />
      )}

      {/* ================= PLANET ================= */}
      <circle
        cx={center}
        cy={center}
        r={size * 0.5}
        fill={PLANET_COLORS[planetName]}
      />

      {/* ================= DETAILS ================= */}

      {/* Moon */}
      {planetName === 'MOON' && (
        <>
          <circle cx={size * 0.3} cy={size * 0.4} r={size * 0.12} fill="rgba(0,0,0,0.2)" />
          <circle cx={size * 0.7} cy={size * 0.3} r={size * 0.08} fill="rgba(0,0,0,0.2)" />
          <circle cx={size * 0.6} cy={size * 0.7} r={size * 0.1} fill="rgba(0,0,0,0.2)" />
        </>
      )}

      {/* Jupiter */}
      {planetName === 'JUPITER' && (
        <>
          <rect x="0" y={size * 0.2} width={size} height={size * 0.12} fill="rgba(80,40,0,0.2)" />
          <rect x="0" y={size * 0.45} width={size} height={size * 0.18} fill="rgba(80,40,0,0.3)" />
          <rect x="0" y={size * 0.75} width={size} height={size * 0.1} fill="rgba(80,40,0,0.2)" />
        </>
      )}

      {/* ================= RINGS FRONT ================= */}
      {(planetName === 'SATURN' || planetName === 'NEPTUNE') && (
        <ellipse
          cx={center}
          cy={center}
          rx={size * (planetName === 'SATURN' ? 0.8 : 0.75)}
          ry={size * (planetName === 'SATURN' ? 0.28 : 0.3)}
          fill="none"
          stroke={
            planetName === 'SATURN'
              ? 'rgba(184,146,74,0.7)'
              : 'rgba(184,205,244,0.7)'
          }
          strokeWidth={size * 0.03}
          transform={`rotate(${planetName === 'SATURN' ? -20 : -15} ${center} ${center})`}
        />
      )}
    </svg>
  );
};