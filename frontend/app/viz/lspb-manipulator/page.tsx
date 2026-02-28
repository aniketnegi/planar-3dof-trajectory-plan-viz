"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { RotateCcw, Settings2 } from "lucide-react";

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 600;
const BASE_X = CANVAS_WIDTH / 2;
const BASE_Y = CANVAS_HEIGHT / 2;

export default function LspbDashboard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Controls State - Reduced lengths so max reach (240) fits inside 300px radius safely
  const [L1, setL1] = useState(100);
  const [L2, setL2] = useState(80);
  const [L3, setL3] = useState(60);
  const [duration, setDuration] = useState(2.5);

  // Kinematics & Animation State
  const [currentAngles, setCurrentAngles] = useState([
    Math.PI / 4,
    -Math.PI / 4,
    -Math.PI / 4,
  ]);
  const [targetXY, setTargetXY] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [trajectory, setTrajectory] = useState<any[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [hoverFrame, setHoverFrame] = useState<number | null>(null); // For chart scrubbing
  const [error, setError] = useState<string | null>(null);

  // Coordinate Mapping
  const toCanvasCoords = (x: number, y: number) => ({
    cx: BASE_X + x,
    cy: BASE_Y - y,
  });
  const toRobotCoords = (cx: number, cy: number) => ({
    x: cx - BASE_X,
    y: BASE_Y - cy,
  });

  // Forward Kinematics
  const getJointPositions = (q: number[], l1 = L1, l2 = L2, l3 = L3) => {
    let x = 0,
      y = 0;
    const points = [{ x, y }];
    let currentAngle = 0;
    const lengths = [l1, l2, l3];

    for (let i = 0; i < 3; i++) {
      currentAngle += q[i];
      x += lengths[i] * Math.cos(currentAngle);
      y += lengths[i] * Math.sin(currentAngle);
      points.push({ x, y });
    }
    return points;
  };

  // Live Jacobian Calculation
  const getLiveJacobian = (q: number[]) => {
    const s1 = Math.sin(q[0]);
    const c1 = Math.cos(q[0]);
    const s12 = Math.sin(q[0] + q[1]);
    const c12 = Math.cos(q[0] + q[1]);
    const s123 = Math.sin(q[0] + q[1] + q[2]);
    const c123 = Math.cos(q[0] + q[1] + q[2]);

    return [
      [-L1 * s1 - L2 * s12 - L3 * s123, -L2 * s12 - L3 * s123, -L3 * s123],
      [L1 * c1 + L2 * c12 + L3 * c123, L2 * c12 + L3 * c123, L3 * c123],
    ];
  };

  // Determine which angles to display (Live vs Scrubbing)
  const displayAngles =
    hoverFrame !== null && trajectory[hoverFrame]
      ? [
          trajectory[hoverFrame].q1,
          trajectory[hoverFrame].q2,
          trajectory[hoverFrame].q3,
        ]
      : currentAngles;

  // Draw loop
  const drawCanvas = (angles: number[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Fade the robot if we are hovering over history
    ctx.globalAlpha = hoverFrame !== null ? 0.6 : 1.0;

    // 1. Faint Background Grid
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = 1;
    for (let i = 0; i < CANVAS_WIDTH; i += 50) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, CANVAS_HEIGHT);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(CANVAS_WIDTH, i);
      ctx.stroke();
    }
    ctx.strokeStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.moveTo(BASE_X, 0);
    ctx.lineTo(BASE_X, CANVAS_HEIGHT);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, BASE_Y);
    ctx.lineTo(CANVAS_WIDTH, BASE_Y);
    ctx.stroke();

    // 2. Visual Limit of Reach Area
    const maxReach = L1 + L2 + L3;
    ctx.beginPath();
    ctx.arc(BASE_X, BASE_Y, maxReach, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(59, 130, 246, 0.03)";
    ctx.fill();
    ctx.strokeStyle = "rgba(59, 130, 246, 0.2)";
    ctx.setLineDash([8, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Draw Dotted Trajectory Path
    if (trajectory.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = "#94a3b8";
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2;
      trajectory.forEach((pt, idx) => {
        // Use the pre-calculated ee coordinates
        const { cx, cy } = toCanvasCoords(pt.ee_x, pt.ee_y);
        if (idx === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 4. Draw Target Crosshair
    if (targetXY) {
      const { cx, cy } = toCanvasCoords(targetXY.x, targetXY.y);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 10, cy);
      ctx.lineTo(cx + 10, cy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - 10);
      ctx.lineTo(cx, cy + 10);
      ctx.stroke();
    }

    // 5. Draw Robot Links
    const points = getJointPositions(angles);
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = toCanvasCoords(points[i].x, points[i].y);
      const p2 = toCanvasCoords(points[i + 1].x, points[i + 1].y);

      ctx.strokeStyle = i === 0 ? "#3b82f6" : i === 1 ? "#10b981" : "#f59e0b";
      ctx.beginPath();
      ctx.moveTo(p1.cx, p1.cy);
      ctx.lineTo(p2.cx, p2.cy);
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p1.cx, p1.cy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // End Effector
    const ee = toCanvasCoords(points[3].x, points[3].y);
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(ee.cx, ee.cy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0; // reset
  };

  useEffect(() => {
    if (!isAnimating || hoverFrame !== null) drawCanvas(displayAngles);
  }, [displayAngles, targetXY, isAnimating, L1, L2, L3, hoverFrame]);

  // Handle Request & Clamping
  const handleCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isAnimating) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    let target = toRobotCoords(cx, cy);

    // CLAMPING LOGIC: If outside max reach, snap to boundary
    const dist = Math.sqrt(target.x ** 2 + target.y ** 2);
    const maxReach = L1 + L2 + L3 - 0.1; // 0.1 buffer to prevent IK singularities
    if (dist > maxReach) {
      target.x = (target.x / dist) * maxReach;
      target.y = (target.y / dist) * maxReach;
    }

    setTargetXY(target);
    setError(null);

    try {
      const res = await fetch("http://localhost:8000/api/generate_trajectory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_angles: currentAngles,
          target_x: target.x,
          target_y: target.y,
          duration: duration,
          dt: 0.05,
          l1: L1,
          l2: L2,
          l3: L3,
        }),
      });

      if (!res.ok)
        throw new Error(
          (await res.json()).detail || "Failed to generate trajectory",
        );

      const data = await res.json();

      // Augment trajectory with End Effector (X, Y) for the 4th graph
      const enrichedTrajectory = data.trajectory.map((pt: any) => {
        const ee = getJointPositions([pt.q1, pt.q2, pt.q3], L1, L2, L3)[3];
        return { ...pt, ee_x: ee.x, ee_y: ee.y };
      });

      setTrajectory(enrichedTrajectory);
      setCurrentFrame(0);
      setIsAnimating(true);
    } catch (err: any) {
      setError(err.message);
      setTargetXY(null);
    }
  };

  // Animation Loop
  useEffect(() => {
    if (!isAnimating || trajectory.length === 0 || hoverFrame !== null) return;

    let frameId: number;
    let frameIndex = 0;

    const animate = () => {
      if (frameIndex >= trajectory.length) {
        setIsAnimating(false);
        const finalPoint = trajectory[trajectory.length - 1];
        setCurrentAngles([finalPoint.q1, finalPoint.q2, finalPoint.q3]);
        return;
      }

      const point = trajectory[frameIndex];
      setCurrentFrame(frameIndex);
      setCurrentAngles([point.q1, point.q2, point.q3]);
      drawCanvas([point.q1, point.q2, point.q3]);

      frameIndex++;
      setTimeout(() => {
        frameId = requestAnimationFrame(animate);
      }, 50);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [isAnimating, trajectory, hoverFrame]);

  const liveJ = getLiveJacobian(displayAngles);
  const eePos = getJointPositions(displayAngles)[3];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6 font-sans flex flex-col">
      <header className="mb-6 flex justify-between items-end border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">
            Trajectory Generator
          </h1>
          <p className="text-slate-500 text-sm">
            Joint Space LSPB & Live Jacobian Diagnostics
          </p>
        </div>
        {error && (
          <div className="text-red-600 bg-red-50 px-4 py-2 rounded-lg text-sm border border-red-200">
            {error}
          </div>
        )}
      </header>

      <div className="flex gap-6 flex-1">
        {/* Left Column: Canvas & Controls */}
        <div className="w-[600px] flex flex-col gap-4">
          <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden cursor-crosshair relative">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              onClick={handleCanvasClick}
              className="block"
            />
          </div>

          {/* Controls Panel */}
          <div className="bg-white border border-slate-200 shadow-sm p-4 rounded-xl flex flex-col gap-4">
            <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm border-b border-slate-100 pb-2">
              <Settings2 size={16} /> Configuration Parameters
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <label className="flex flex-col gap-1 text-slate-500">
                L1 Length ({L1}mm)
                <input
                  type="range"
                  min="50"
                  max="150"
                  value={L1}
                  onChange={(e) => setL1(Number(e.target.value))}
                  className="accent-blue-500"
                />
              </label>
              <label className="flex flex-col gap-1 text-slate-500">
                L2 Length ({L2}mm)
                <input
                  type="range"
                  min="50"
                  max="150"
                  value={L2}
                  onChange={(e) => setL2(Number(e.target.value))}
                  className="accent-emerald-500"
                />
              </label>
              <label className="flex flex-col gap-1 text-slate-500">
                L3 Length ({L3}mm)
                <input
                  type="range"
                  min="30"
                  max="100"
                  value={L3}
                  onChange={(e) => setL3(Number(e.target.value))}
                  className="accent-amber-500"
                />
              </label>
              <label className="flex flex-col gap-1 text-slate-500 font-medium text-indigo-600">
                Duration ({duration}s)
                <input
                  type="range"
                  min="0.5"
                  max="10"
                  step="0.5"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="accent-indigo-500"
                />
              </label>
            </div>
            <div className="flex justify-between items-center mt-2 pt-4 border-t border-slate-100">
              <span className="text-slate-500 text-sm">
                Status:{" "}
                <span
                  className={
                    isAnimating
                      ? "text-blue-500 font-medium"
                      : hoverFrame !== null
                        ? "text-amber-500 font-medium"
                        : "text-emerald-500 font-medium"
                  }
                >
                  {hoverFrame !== null
                    ? "History Scrubbing..."
                    : isAnimating
                      ? "Executing Path..."
                      : "Idle (Click Canvas)"}
                </span>
              </span>
              <button
                onClick={() => {
                  setCurrentAngles([Math.PI / 4, -Math.PI / 4, -Math.PI / 4]);
                  setTrajectory([]);
                  setTargetXY(null);
                  setError(null);
                  setHoverFrame(null);
                }}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors text-sm font-medium"
              >
                <RotateCcw size={14} /> Reset Pose
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Telemetry & Matrices */}
        <div className="flex-1 flex flex-col gap-4">
          <div className="bg-white border border-slate-200 shadow-sm p-4 rounded-xl">
            <h3 className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">
              Real-Time Kinematics Matrix
            </h3>
            <div className="grid grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <div className="text-xs text-slate-500">
                  End Effector (X, Y)
                </div>
                <div className="font-mono text-sm bg-slate-50 p-2 rounded border border-slate-100">
                  [{eePos.x.toFixed(2)}, {eePos.y.toFixed(2)}]
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Joint Angles θ (rad)
                </div>
                <div className="font-mono text-sm bg-slate-50 p-2 rounded border border-slate-100">
                  [{displayAngles[0].toFixed(3)}, {displayAngles[1].toFixed(3)},{" "}
                  {displayAngles[2].toFixed(3)}]
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="text-xs text-slate-500">
                  Instantaneous Jacobian J(θ)
                </div>
                <div className="font-mono text-xs bg-slate-50 p-2 rounded border border-slate-100 flex flex-col gap-1 overflow-x-auto whitespace-nowrap">
                  <div>
                    [{liveJ[0][0].toFixed(2)}, {liveJ[0][1].toFixed(2)},{" "}
                    {liveJ[0][2].toFixed(2)}]
                  </div>
                  <div>
                    [{liveJ[1][0].toFixed(2)}, {liveJ[1][1].toFixed(2)},{" "}
                    {liveJ[1][2].toFixed(2)}]
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4 Miniature Charts Grid */}
          <div className="flex-1 grid grid-cols-2 gap-3 min-h-[400px]">
            {/* Charts for Joint 1, 2, 3 */}
            {[1, 2, 3].map((jointNum) => {
              const qKey = `q${jointNum}`;
              const colors = ["#3b82f6", "#10b981", "#f59e0b"];
              const color = colors[jointNum - 1];

              return (
                <div
                  key={jointNum}
                  className="bg-white border border-slate-200 shadow-sm p-3 rounded-xl flex flex-col h-full"
                >
                  <h3 className="text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                    Joint {jointNum} Position (rad)
                  </h3>
                  <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={trajectory}
                        margin={{ top: 5, right: 5, bottom: 0, left: -25 }}
                        onMouseMove={(e: any) =>
                          e.activeTooltipIndex !== undefined &&
                          setHoverFrame(e.activeTooltipIndex)
                        }
                        onMouseLeave={() => setHoverFrame(null)}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#f1f5f9"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="time"
                          stroke="#cbd5e1"
                          tick={{ fill: "#64748b", fontSize: 10 }}
                          tickFormatter={(val) => val.toFixed(1)}
                        />
                        <YAxis
                          stroke="#cbd5e1"
                          tick={{ fill: "#64748b", fontSize: 10 }}
                          domain={["dataMin - 0.5", "dataMax + 0.5"]}
                        />
                        <Tooltip contentStyle={{ fontSize: "12px" }} />
                        <Line
                          type="monotone"
                          dataKey={qKey}
                          stroke={color}
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                        {trajectory.length > 0 && (
                          <ReferenceLine
                            x={
                              trajectory[
                                hoverFrame !== null ? hoverFrame : currentFrame
                              ]?.time
                            }
                            stroke="#ef4444"
                            strokeWidth={1}
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })}

            {/* Chart 4: End Effector X, Y */}
            <div className="bg-white border border-slate-200 shadow-sm p-3 rounded-xl flex flex-col h-full">
              <h3 className="text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                End Effector X, Y
              </h3>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={trajectory}
                    margin={{ top: 5, right: 5, bottom: 0, left: -25 }}
                    onMouseMove={(e: any) =>
                      e.activeTooltipIndex !== undefined &&
                      setHoverFrame(e.activeTooltipIndex)
                    }
                    onMouseLeave={() => setHoverFrame(null)}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#f1f5f9"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="time"
                      stroke="#cbd5e1"
                      tick={{ fill: "#64748b", fontSize: 10 }}
                      tickFormatter={(val) => val.toFixed(1)}
                    />
                    <YAxis
                      stroke="#cbd5e1"
                      tick={{ fill: "#64748b", fontSize: 10 }}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip contentStyle={{ fontSize: "12px" }} />
                    <Line
                      type="monotone"
                      dataKey="ee_x"
                      stroke="#ef4444"
                      name="X"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="ee_y"
                      stroke="#8b5cf6"
                      name="Y"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    {trajectory.length > 0 && (
                      <ReferenceLine
                        x={
                          trajectory[
                            hoverFrame !== null ? hoverFrame : currentFrame
                          ]?.time
                        }
                        stroke="#ef4444"
                        strokeWidth={1}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
