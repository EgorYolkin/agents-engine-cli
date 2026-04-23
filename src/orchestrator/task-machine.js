import { assign, createActor, fromPromise, setup } from "xstate";

import { selectAction } from "./action-selector.js";
import { spawnWorker } from "./sub-agent-manager.js";

export function createTaskMachine({
  selectActionImpl = selectAction,
  spawnWorkerImpl = spawnWorker,
  resetDelayMs = 30_000,
} = {}) {
  return setup({
    actors: {
      selectAction: fromPromise(async ({ input }) => (
        selectActionImpl(input.prompt, input.routerProvider, input.config, input.hooks)
      )),
      spawnWorker: fromPromise(async ({ input }) => (
        spawnWorkerImpl(input.domain, input.taskContext)
      )),
    },
    guards: {
      circuitOpen: ({ context }) => context.errors >= context.maxErrors,
      tooManyErrors: ({ context }) => context.errors >= context.maxErrors,
    },
  }).createMachine({
    id: "task",
    initial: "idle",
    context: ({ input }) => ({
      prompt: input?.prompt ?? "",
      domain: null,
      action: null,
      confidence: 0,
      result: null,
      error: null,
      errors: input?.errors ?? 0,
      maxErrors: input?.maxErrors ?? 3,
      provider: input?.provider ?? null,
      routerProvider: input?.routerProvider ?? null,
      config: input?.config ?? null,
      runtimeOverrides: input?.runtimeOverrides ?? {},
      signal: input?.signal ?? null,
      contextRef: input?.context ?? null,
      hooks: input?.hooks ?? {},
    }),
    output: ({ context }) => ({
      domain: context.domain,
      action: context.action,
      confidence: context.confidence,
      result: context.result,
      error: context.error,
      errors: context.errors,
    }),
    states: {
      idle: {
        on: {
          SUBMIT: {
            target: "routing",
            actions: assign({
              prompt: ({ event }) => event.prompt,
              domain: null,
              action: null,
              confidence: 0,
              result: null,
              error: null,
            }),
          },
        },
      },
      routing: {
        invoke: {
          src: "selectAction",
          input: ({ context }) => ({
            prompt: context.prompt,
            routerProvider: context.routerProvider,
            config: context.config,
            hooks: context.hooks,
          }),
          onDone: {
            target: "dispatching",
            actions: assign({
              domain: ({ event }) => event.output.domain,
              action: ({ event }) => event.output.action,
              confidence: ({ event }) => event.output.confidence,
              error: null,
            }),
          },
          onError: {
            target: "error",
            actions: assign({
              error: ({ event }) => event.error,
            }),
          },
        },
      },
      dispatching: {
        always: [
          { guard: "circuitOpen", target: "circuit_open" },
          { target: "executing" },
        ],
      },
      executing: {
        invoke: {
          src: "spawnWorker",
          input: ({ context }) => ({
            domain: context.domain ?? "general",
            taskContext: {
              provider: context.provider,
              config: context.config,
              prompt: context.prompt,
              runtimeOverrides: context.runtimeOverrides,
              signal: context.signal,
              context: context.contextRef,
              ...context.hooks,
            },
          }),
          onDone: {
            target: "done",
            actions: assign({
              result: ({ event }) => event.output,
              error: null,
            }),
          },
          onError: {
            target: "error",
            actions: assign({
              error: ({ event }) => event.error,
            }),
          },
        },
      },
      done: {
        type: "final",
      },
      error: {
        entry: assign({
          errors: ({ context }) => context.errors + 1,
        }),
        always: [
          { guard: "tooManyErrors", target: "circuit_open" },
          { target: "idle" },
        ],
      },
      circuit_open: {
        after: {
          [resetDelayMs]: {
            target: "idle",
            actions: assign({
              errors: 0,
              error: null,
            }),
          },
        },
      },
    },
  });
}

export const taskMachine = createTaskMachine();

export function waitForTaskActor(actor) {
  return new Promise((resolve, reject) => {
    let subscription;

    function settle(snapshot) {
      if (snapshot.status === "done" || snapshot.matches("done")) {
        subscription?.unsubscribe();
        resolve(snapshot);
        return true;
      }

      if (snapshot.matches("circuit_open")) {
        subscription?.unsubscribe();
        resolve(snapshot);
        return true;
      }

      if (snapshot.matches("idle") && snapshot.context.error) {
        subscription?.unsubscribe();
        reject(snapshot.context.error);
        return true;
      }

      return false;
    }

    subscription = actor.subscribe({
      next: (snapshot) => {
        settle(snapshot);
      },
      error: (error) => {
        subscription?.unsubscribe();
        reject(error);
      },
    });

    settle(actor.getSnapshot());
  });
}

export function createTaskActor(input) {
  return createActor(taskMachine, { input });
}
