import ReactECharts from "echarts-for-react";

export default function EChart({
  option,
  height = 320,
  chartKey,
  onEvents,
}: {
  option: Record<string, unknown>;
  height?: number;
  chartKey?: string;
  onEvents?: Record<string, (params: unknown) => void>;
}) {
  return (
    <ReactECharts
      key={chartKey}
      option={option}
      onEvents={onEvents}
      style={{ height, width: "100%" }}
      notMerge
      lazyUpdate={false}
    />
  );
}
