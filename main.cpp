// bayes_walks.c
//
//   Possibility cone of a random walk, pruned by what has already happened.
//
//   Build:  gcc bayes_walks.c -o bayes_walks -lraylib -lm
//   (macOS: gcc bayes_walks.c -o bayes_walks -lraylib -framework OpenGL -framework Cocoa -framework IOKit)
//
//   WHY A TREE AND NOT N INDEPENDENT WALKS
//   Sampling N independent walks and then "keeping the ones that match reality"
//   never works: two independent walks agree on a prefix with probability 0
//   (or 2^-t for a coin walk), so you would delete all of them on step 1.
//   The object that actually carries the semantics is a BRANCHING TREE:
//     - every node = a state of the world at some time t
//     - every edge = one increment of the walk
//     - every root->leaf path = one complete possible history
//   Conditioning on the observed prefix is then not filtering, it is
//   RESTRICTING TO A SUBTREE: the moment reality takes the left edge, the whole
//   right subtree stops being a possible future. Bayes here is set arithmetic
//   on the tree, not a reweighting.
//
//   Surviving futures after t steps = 2^(DEPTH - t) out of 2^DEPTH.
//   Elimination is exponential in t, which is the point being demonstrated.

#include "raylib.h"
#include <math.h>
#include <stdlib.h>

#define DEPTH 11                  // time steps; leaves = 2^11 = 2048 possible histories
#define NODES (1 << (DEPTH + 1))  // heap layout, 1-based: root = 1, children of i are 2i and 2i+1
#define W     1280
#define H     720
#define PAD   70

static float pos[NODES];        // pos[i]  = walk value at node i
static int   real[DEPTH + 1];   // real[d] = node index of the history that actually happened, at depth d
static float yScale;            // world units -> pixels

// ---------------------------------------------------------------- generation

static float gauss(void) {  // Box-Muller: one Gaussian increment
    float u1 = (rand() + 1.0f) / ((float)RAND_MAX + 2.0f);
    float u2 = (float)rand() / (float)RAND_MAX;
    return sqrtf(-2.0f * logf(u1)) * cosf(2.0f * PI * u2);
}

static void build(unsigned seed) {
    srand(seed);

    // Every node inherits its parent's value plus its own fresh increment.
    // Heap order means i/2 is always already filled in when we reach i.
    pos[1] = 0.0f;
    for (int i = 2; i < NODES; i++) pos[i] = pos[i / 2] + gauss();

    // The realized history: at each step reality picks one of the two children.
    // Nothing about this path is special - it is just the branch that happened.
    real[0] = 1;
    for (int d = 1; d <= DEPTH; d++) real[d] = 2 * real[d - 1] + (rand() & 1);

    float m = 1e-6f;
    for (int i = 1; i < NODES; i++) if (fabsf(pos[i]) > m) m = fabsf(pos[i]);
    yScale = (H / 2.0f - PAD) / m;
}

// ---------------------------------------------------------------- geometry

// x axis = time (depth), y axis = walk value, origin pinned at mid-height.
static Vector2 pt(float t, float v) {
    Vector2 p = { PAD + (t / (float)DEPTH) * (W - 2 * PAD), H / 2.0f - v * yScale };
    return p;
}

// Is node i (at depth d) still a possible world, given that reality has
// reached node real[dNow] at depth dNow?
//
//   d >= dNow : i survives iff it is a DESCENDANT of the current node.
//               i >> (d - dNow) walks i up (d - dNow) levels in heap indexing.
//   d <  dNow : i survives iff it is an ANCESTOR of the current node,
//               i.e. part of the history that already happened.
//
// Both are one shift and one compare - no per-frame tree traversal needed.
static int alive(int i, int d, int dNow) {
    return (d >= dNow) ? ((i >> (d - dNow)) == real[dNow])
                       : ((real[dNow] >> (dNow - d)) == i);
}

// ---------------------------------------------------------------- main

int main(void) {
    InitWindow(W, H, "possibility cone: branching walk pruned by history");
    SetTargetFPS(60);
    build(1337);

    float tNow  = 0.0f;   // continuous cursor; integer part = how many steps have resolved
    float speed = 1.2f;   // steps per second
    int   paused = 0;

    const Color DEAD  = { 120, 125, 140,  38 };  // futures already ruled out
    const Color LIVE  = {  90, 200, 255, 110 };  // futures still reachable
    const Color TRUTH = { 255, 190,  60, 255 };  // the path that actually happened
    const Color NOWL  = { 255, 255, 255,  55 };

    while (!WindowShouldClose()) {
        // ---- input
        if (IsKeyPressed(KEY_SPACE)) paused = !paused;
        if (IsKeyPressed(KEY_R))     { build((unsigned)(GetTime() * 1000.0)); tNow = 0.0f; }
        if (IsKeyDown(KEY_RIGHT))    tNow += 4.0f * GetFrameTime();
        if (IsKeyDown(KEY_LEFT))     tNow -= 4.0f * GetFrameTime();
        if (IsKeyPressed(KEY_UP))    speed *= 1.5f;
        if (IsKeyPressed(KEY_DOWN))  speed /= 1.5f;
        if (!paused)                 tNow += speed * GetFrameTime();

        if (tNow < 0.0f)     tNow = 0.0f;
        if (tNow > DEPTH)    tNow = DEPTH;

        int   dNow = (int)tNow;              // steps that have fully resolved
        float frac = tNow - (float)dNow;     // partial progress into the next step

        BeginDrawing();
        ClearBackground((Color){ 14, 16, 22, 255 });

        // ---- pass 1: dead edges (drawn first so live ones sit on top)
        for (int d = 1; d <= DEPTH; d++)
            for (int i = (1 << d); i < (1 << (d + 1)); i++)
                if (!alive(i, d, dNow))
                    DrawLineV(pt(d - 1.0f, pos[i / 2]), pt((float)d, pos[i]), DEAD);

        // ---- pass 2: surviving edges = the subtree hanging off the present,
        //              plus the realized trunk behind it
        for (int d = 1; d <= DEPTH; d++)
            for (int i = (1 << d); i < (1 << (d + 1)); i++)
                if (alive(i, d, dNow))
                    DrawLineV(pt(d - 1.0f, pos[i / 2]), pt((float)d, pos[i]), LIVE);

        // ---- the realized history, thick; last segment drawn partially so the
        //      present slides continuously instead of snapping between steps
        for (int d = 1; d <= dNow; d++)
            DrawLineEx(pt(d - 1.0f, pos[real[d - 1]]), pt((float)d, pos[real[d]]), 3.0f, TRUTH);

        Vector2 head = pt((float)dNow, pos[real[dNow]]);
        if (dNow < DEPTH) {
            Vector2 nxt = pt(dNow + 1.0f, pos[real[dNow + 1]]);
            head.x += (nxt.x - head.x) * frac;
            head.y += (nxt.y - head.y) * frac;
            DrawLineEx(pt((float)dNow, pos[real[dNow]]), head, 3.0f, TRUTH);
        }
        DrawCircleV(head, 6.0f, TRUTH);

        // ---- "now" line: everything left of it is fact, everything right is branching
        DrawLineV((Vector2){ head.x, PAD * 0.4f }, (Vector2){ head.x, H - PAD * 0.9f }, NOWL);

        // ---- HUD
        int total = 1 << DEPTH;
        int left  = 1 << (DEPTH - dNow);
        DrawText(TextFormat("t = %d / %d", dNow, DEPTH), PAD, 22, 24, RAYWHITE);
        DrawText(TextFormat("possible futures: %d of %d  (%.2f%%)",
                            left, total, 100.0f * left / total), PAD, 52, 20, LIVE);
        DrawText(TextFormat("eliminated by history: %d", total - left), PAD, 76, 20, DEAD);
        DrawText("space pause   left/right scrub   up/down speed   R reseed",
                 PAD, H - 32, 18, (Color){ 150, 155, 170, 200 });

        EndDrawing();
    }

    CloseWindow();
    return 0;
}
