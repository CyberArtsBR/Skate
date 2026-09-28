const EPSILON = 1e-6;

function pointPosition(support) {
  return support?.position || support;
}

function normalizedUpwardNormal(sample) {
  const x = Number(sample.normal?.x) || 0;
  const y = Number(sample.normal?.y) || 0;
  const length = Math.hypot(x, y) || 1;
  const sign = y < 0 ? -1 : 1;
  return { x: (x / length) * sign, y: (y / length) * sign };
}

function supportWorldPoint(sample, centerNormal, angle, clearance, support) {
  const point = pointPosition(support);
  const localX = Number(point?.x) || 0;
  const localY = Number(point?.y) || 0;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);

  return {
    x: sample.x
      + centerNormal.x * clearance
      + cosine * localX
      - sine * localY,
    y: sample.y
      + centerNormal.y * clearance
      + sine * localX
      + cosine * localY,
  };
}

export function measureSupportClearance({
  profile,
  sample,
  normal,
  angle,
  clearance,
  supportPoints = [],
}) {
  const centerLength = Math.hypot(normal.x, normal.y) || 1;
  const centerNormal = {
    x: normal.x / centerLength,
    y: normal.y / centerLength,
  };

  const measurements = supportPoints.map((support, index) => {
    const world = supportWorldPoint(sample, centerNormal, angle, clearance, support);
    const surface = profile.sample(world.x);
    const surfaceNormal = normalizedUpwardNormal(surface);
    const separation = (
      (world.x - surface.x) * surfaceNormal.x
      + (world.y - surface.y) * surfaceNormal.y
    );
    const alignment = Math.max(
      EPSILON,
      centerNormal.x * surfaceNormal.x + centerNormal.y * surfaceNormal.y,
    );

    return {
      name: support?.name || `support-${index + 1}`,
      separation,
      alignment,
      worldX: world.x,
      worldY: world.y,
      surfaceX: surface.x,
      surfaceY: surface.y,
    };
  });

  return {
    minSeparation: measurements.length
      ? Math.min(...measurements.map((measurement) => measurement.separation))
      : clearance,
    supports: measurements,
  };
}

export function resolveContactClearance({
  profile,
  sample,
  normal,
  angle,
  supportPoints = [],
  baseClearance = 0,
  minimumSeparation = baseClearance,
  maxIterations = 6,
}) {
  let clearance = Math.max(0, Number(baseClearance) || 0);
  const target = Math.max(0, Number(minimumSeparation) || 0);
  let iterations = 0;

  if (!supportPoints.length) {
    return {
      clearance,
      extraClearance: 0,
      minimumSeparation: target,
      minSeparation: clearance,
      iterations,
      supports: [],
    };
  }

  for (; iterations < maxIterations; iterations += 1) {
    const measurement = measureSupportClearance({
      profile,
      sample,
      normal,
      angle,
      clearance,
      supportPoints,
    });

    let requiredDelta = 0;
    for (const support of measurement.supports) {
      const deficit = target - support.separation;
      if (deficit <= EPSILON) continue;
      requiredDelta = Math.max(requiredDelta, deficit / support.alignment);
    }

    if (requiredDelta <= EPSILON) break;
    clearance += requiredDelta;
  }

  const finalMeasurement = measureSupportClearance({
    profile,
    sample,
    normal,
    angle,
    clearance,
    supportPoints,
  });

  return {
    clearance,
    extraClearance: clearance - Math.max(0, Number(baseClearance) || 0),
    minimumSeparation: target,
    minSeparation: finalMeasurement.minSeparation,
    iterations,
    supports: finalMeasurement.supports,
  };
}
