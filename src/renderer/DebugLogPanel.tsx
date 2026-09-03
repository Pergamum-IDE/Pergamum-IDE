import { useEffect, useMemo, useState } from "react";
import type { DebugLogSnapshot } from "../shared/debugLog";
import type { Translate } from "../shared/i18n";
import {
  createDebugLogPanelSessionController,
  formatDebugLogEventTime,
  type DebugLogPanelState
} from "./debugLogPanelState";

interface DebugLogPanelProps {
  translate: Translate;
}

interface DebugLogPanelViewProps {
  state: DebugLogPanelState;
  translate: Translate;
  now?: Date;
}

const initialDebugLogPanelState: DebugLogPanelState = {
  snapshot: null,
  events: [],
  possibleGap: false
};

export function DebugLogPanel({ translate }: DebugLogPanelProps): JSX.Element {
  const [state, setState] = useState<DebugLogPanelState>(
    initialDebugLogPanelState
  );

  useEffect(() => {
    setState(initialDebugLogPanelState);

    const controller = createDebugLogPanelSessionController({
      api: window.pergamum.debugLog,
      onStateChange: setState
    });

    controller.start();

    return () => {
      controller.dispose();
    };
  }, []);

  return <DebugLogPanelView state={state} translate={translate} />;
}

export function DebugLogPanelView({
  state,
  translate,
  now
}: DebugLogPanelViewProps): JSX.Element {
  const snapshot = state.snapshot;

  if (!snapshot) {
    return (
      <div className="debugLogPanel">
        <p className="utilityWindowEmpty">{translate("debugLog.loading")}</p>
      </div>
    );
  }

  if (!snapshot.enabled) {
    return (
      <div className="debugLogPanel debugLogPanelDisabled">
        <p className="debugLogPanelEmptyTitle">
          {translate("debugLog.disabled.title")}
        </p>
        <p className="utilityWindowEmpty">
          {translate("debugLog.disabled.hint")}
        </p>
      </div>
    );
  }

  return (
    <div className="debugLogPanel">
      <DebugLogPanelHeader
        snapshot={snapshot}
        possibleGap={state.possibleGap}
        translate={translate}
      />
      <DebugLogEventTable
        events={state.events}
        translate={translate}
        now={now}
      />
    </div>
  );
}

function DebugLogPanelHeader({
  snapshot,
  possibleGap,
  translate
}: {
  snapshot: DebugLogSnapshot;
  possibleGap: boolean;
  translate: Translate;
}): JSX.Element {
  return (
    <div className="debugLogPanelHeader">
      <p className="debugLogPanelDescription">
        {translate("debugLog.enabled.description")}
      </p>
      <p className="debugLogPanelMeta">
        {translate("debugLog.showingLatest", {
          limit: snapshot.uiBufferLimit
        })}
      </p>
      {snapshot.uiDroppedEventCount > 0 ? (
        <p className="debugLogPanelMeta">
          {translate("debugLog.droppedEvents", {
            count: snapshot.uiDroppedEventCount
          })}
        </p>
      ) : null}
      {possibleGap ? (
        <p className="debugLogPanelMeta debugLogPanelGap">
          {translate("debugLog.possibleGap")}
        </p>
      ) : null}
    </div>
  );
}

function DebugLogEventTable({
  events,
  translate,
  now
}: {
  events: DebugLogPanelState["events"];
  translate: Translate;
  now?: Date;
}): JSX.Element {
  const renderedEvents = useMemo(
    () =>
      events.map((event, index) => ({
        event,
        time: formatDebugLogEventTime(
          event.timestamp,
          index > 0 ? events[index - 1].timestamp : null,
          now
        )
      })),
    [events, now]
  );

  return (
    <table
      className="debugLogTable"
      aria-label={translate("debugLog.title")}
    >
      <thead>
        <tr>
          <th scope="col">{translate("debugLog.column.seq")}</th>
          <th scope="col">{translate("debugLog.column.time")}</th>
          <th scope="col">{translate("debugLog.column.level")}</th>
          <th scope="col">{translate("debugLog.column.event")}</th>
        </tr>
      </thead>
      <tbody>
        {renderedEvents.map(({ event, time }) => (
          <DebugLogEventRows
            key={event.seq}
            event={event}
            time={time}
          />
        ))}
      </tbody>
    </table>
  );
}

function DebugLogEventRows({
  event,
  time
}: {
  event: DebugLogPanelState["events"][number];
  time: string;
}): JSX.Element {
  return (
    <>
      <tr>
        <td className="debugLogSeq">{event.seq}</td>
        <td className="debugLogTime">{time}</td>
        <td className={`debugLogLevel debugLogLevel-${event.level}`}>
          {event.level}
        </td>
        <td className="debugLogEventName">{event.event}</td>
      </tr>
      {event.details ? (
        <tr className="debugLogDetailsRow">
          <td colSpan={4}>
            <pre>{JSON.stringify(event.details ?? {}, null, 2)}</pre>
          </td>
        </tr>
      ) : null}
    </>
  );
}
