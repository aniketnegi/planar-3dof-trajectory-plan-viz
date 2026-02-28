from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import polars as pl
import numpy as np
import math

app = FastAPI(title="3-DoF Manipulator Motion Planner")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Configuration & Models ---


class TrajectoryRequest(BaseModel):
    current_angles: list[float]
    target_x: float
    target_y: float
    duration: float = 2.5
    dt: float = 0.05
    # Default lengths updated to match new scale logic
    l1: float = 100.0
    l2: float = 80.0
    l3: float = 60.0


# --- Kinematics & Geometric Jacobian ---


def dh_matrix(theta: float, a: float) -> np.ndarray:
    """Standard Denavit-Hartenberg transformation matrix for a planar link."""
    return np.array(
        [
            [np.cos(theta), -np.sin(theta), 0, a * np.cos(theta)],
            [np.sin(theta), np.cos(theta), 0, a * np.sin(theta)],
            [0, 0, 1, 0],
            [0, 0, 0, 1],
        ]
    )


def compute_kinematics(q: np.ndarray, l1: float, l2: float, l3: float):
    """Computes all transformation matrices and extracts positions/axes."""
    # 1. Compute individual link transformations
    T1 = dh_matrix(q[0], l1)
    T2 = dh_matrix(q[1], l2)
    T3 = dh_matrix(q[2], l3)

    # Compute absolute transformations from base (Frame 0)
    T0_1 = T1
    T0_2 = T0_1 @ T2
    T0_3 = T0_2 @ T3

    # 2. Extract positions (p) - the first 3 rows of the last column
    p0 = np.array([0.0, 0.0, 0.0])
    p1 = T0_1[0:3, 3]
    p2 = T0_2[0:3, 3]
    p3 = T0_3[0:3, 3]  # End-effector pos

    # 3. Compute joint axes (z) in frame 0
    z0 = np.array([0.0, 0.0, 1.0])  # Base Z-axis

    R1 = T0_1[0:3, 0:3]
    R2 = T0_2[0:3, 0:3]

    z1 = R1 @ np.array([0.0, 0.0, 1.0])
    z2 = R2 @ np.array([0.0, 0.0, 1.0])

    return p0, p1, p2, p3, z0, z1, z2


def get_geometric_jacobian(
    q: np.ndarray, l1: float, l2: float, l3: float
) -> np.ndarray:
    """Constructs the Geometric Jacobian using the cross-product method."""
    p0, p1, p2, p3, z0, z1, z2 = compute_kinematics(q, l1, l2, l3)

    # Jv(i) = z_{i-1} x (p_n - p_{i-1})
    Jv1 = np.cross(z0, (p3 - p0))
    Jv2 = np.cross(z1, (p3 - p1))
    Jv3 = np.cross(z2, (p3 - p2))

    Jv = np.column_stack((Jv1, Jv2, Jv3))

    # Return top 2 rows for planar 2D (X, Y) target tracking
    return Jv[0:2, :]


def calculate_ik_jacobian(
    current_q: list[float],
    target_x: float,
    target_y: float,
    l1: float,
    l2: float,
    l3: float,
    tolerance: float = 0.5,
    max_iterations: int = 150,
) -> list[float]:
    """Resolves Inverse Kinematics using the Pseudo-Inverse of the Geometric Jacobian."""
    q = np.array(current_q, dtype=float)
    target_pos = np.array([target_x, target_y])
    alpha = 0.5

    for _ in range(max_iterations):
        _, _, _, p3, _, _, _ = compute_kinematics(q, l1, l2, l3)
        current_pos = p3[0:2]

        error = target_pos - current_pos

        if np.linalg.norm(error) < tolerance:
            # Force shortest angular path from the current angles
            for i in range(len(q)):
                diff = (q[i] - current_q[i] + np.pi) % (2 * np.pi) - np.pi
                q[i] = current_q[i] + diff

            return q.tolist()

        J = get_geometric_jacobian(q, l1, l2, l3)
        J_pinv = np.linalg.pinv(J)

        delta_q = J_pinv @ error
        q = q + alpha * delta_q

    raise ValueError("Target is out of reach or algorithm hit a singularity limit.")


# --- Joint Space Trajectory Generation ---


def generate_lspb_polars(
    q_start: list[float], q_goal: list[float], tf: float, dt: float
) -> list[dict]:
    """Generates an LSPB trajectory using Polars for vectorized performance."""
    tb = tf / 3.0
    time_steps = np.arange(0, tf + dt, dt)
    df = pl.DataFrame({"time": time_steps})

    for i in range(3):
        qs = q_start[i]
        qg = q_goal[i]

        if math.isclose(qs, qg, abs_tol=1e-5):
            df = df.with_columns(
                [
                    pl.lit(qs).alias(f"q{i+1}"),
                    pl.lit(0.0).alias(f"v{i+1}"),
                    pl.lit(0.0).alias(f"a{i+1}"),
                ]
            )
            continue

        accel_c = (qg - qs) / (tb * (tf - tb))
        vel_c = accel_c * tb
        t = pl.col("time")

        q_expr = (
            pl.when(t <= tb)
            .then(qs + 0.5 * accel_c * t**2)
            .when(t <= tf - tb)
            .then(qs + accel_c * tb * (t - tb / 2.0))
            .otherwise(qg - 0.5 * accel_c * (tf - t) ** 2)
        )

        v_expr = (
            pl.when(t <= tb)
            .then(accel_c * t)
            .when(t <= tf - tb)
            .then(vel_c)
            .otherwise(accel_c * (tf - t))
        )

        a_expr = (
            pl.when(t <= tb)
            .then(accel_c)
            .when(t <= tf - tb)
            .then(0.0)
            .otherwise(-accel_c)
        )

        df = df.with_columns(
            [q_expr.alias(f"q{i+1}"), v_expr.alias(f"v{i+1}"), a_expr.alias(f"a{i+1}")]
        )

    return df.to_dicts()


# --- API Endpoint ---


@app.post("/api/generate_trajectory")
async def generate_trajectory(req: TrajectoryRequest):
    try:
        q_goal = calculate_ik_jacobian(
            req.current_angles, req.target_x, req.target_y, req.l1, req.l2, req.l3
        )

        trajectory_data = generate_lspb_polars(
            req.current_angles, q_goal, req.duration, req.dt
        )

        return {
            "status": "success",
            "goal_angles": q_goal,
            "trajectory": trajectory_data,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
