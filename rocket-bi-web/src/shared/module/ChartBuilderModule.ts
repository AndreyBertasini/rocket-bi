import { BaseModule, DIKeys } from '@core/common/modules';
import { Container, Scope } from 'typescript-ioc';
import { ChartType, DateConditionTypes, DateHistogramConditionTypes, DateTypes } from '@/shared';
import {
  BellCurveQuerySettingHandler,
  BellCurveVizSettingHandler,
  BubbleQuerySettingHandler,
  BubbleVizSettingHandler,
  BulletQuerySettingHandler,
  ControlQuerySettingHandler,
  DateSelectFilterQuerySettingHandler,
  DrilldownPieQuerySettingHandler,
  DrilldownPieVizSettingHandler,
  DrilldownQuerySettingHandler,
  DrilldownVizSettingHandler,
  FlattenPivotQuerySettingHandler,
  FlattenPivotTableSettingHandler,
  FlattenTableQuerySettingHandler,
  FlattenTableVizSettingHandler,
  FunnelQuerySettingHandler,
  FunnelVizSettingHandler,
  GaugeQuerySettingHandler,
  GaugeVizSettingHandler,
  GroupMeasureControlQuerySettingHandler,
  HeatMapQuerySettingHandler,
  HeatMapVizSettingHandler,
  HistogramQuerySettingHandler,
  HistogramVizSettingHandler,
  InputFilterQuerySettingHandler,
  MapQuerySettingHandler,
  MapVizHandler,
  NumberQuerySettingHandler,
  NumberVizSettingHandler,
  ParetoQuerySettingHandler,
  ParetoVizSettingHandler,
  ParliamentQuerySettingHandler,
  ParliamentVizSettingHandler,
  PieQuerySettingHandler,
  PieVizSettingHandler,
  PivotQuerySettingHandler,
  PivotTableSettingHandler,
  PyramidQuerySettingHandler,
  PyramidVizSettingHandler,
  SankeyQuerySettingHandler,
  SankeyVizSettingHandler,
  ScatterQuerySettingHandler,
  ScatterVizSettingHandler,
  SeriesQuerySettingHandler,
  SeriesVizSettingHandler,
  SlicerFilterQuerySettingHandler,
  SpiderWebVizSettingHandler,
  SpyderWebQuerySettingHandler,
  StackedVizSettingHandler,
  StackingSeriesQuerySettingHandler,
  StockQuerySettingHandler,
  TabFilterQuerySettingHandler,
  TabFilterVizSettingHandler,
  TableQuerySettingHandler,
  TableVizSettingHandler,
  TreeMapQuerySettingHandler,
  TreeMapVizSettingHandler,
  VizSettingResolver,
  VizSettingResolverBuilder,
  WordCloudQuerySettingHandler,
  WordCloudVizSettingHandler
} from '@/shared/resolver';
import {
  CompareBuilder,
  DashboardSettingVersionBuilder,
  DashboardSettingVersionResolver,
  DefaultDashboardSettingConvertor,
  NumberCompareBuilder,
  SeriesCompareBuilder
} from '@core/common/services';
import { VizSettingType } from '@core/common/domain/model';
import { DefaultRenderProcessService, RenderProcessService } from '@chart/custom/RenderProcessService';
import { PageRenderService, PageRenderServiceImpl } from '@chart/custom/PageRenderService';
import { BodyHTMLRender } from '@chart/custom/render/HTMLRender';
import { CssRenderImpl } from '@chart/custom/render/CSSRender';
import { JSRenderImpl } from '@chart/custom/render/JSRender';
import { FunctionConvertResolver } from '@/screens/chart-builder/config-builder/function-convertor/FunctionConvertResolver';
import { BubbleFunctionConvertor } from '@/screens/chart-builder/config-builder/function-convertor/BubbleFunctionConvertor';
import { FunctionConvertBuilder } from '@/screens/chart-builder/config-builder/function-convertor/FunctionConvertBuilder';
import { ScatterFunctionConvertor } from '@/screens/chart-builder/config-builder/function-convertor/ScatterFunctionConvertor';
import { TableFunctionConvertor } from '@/screens/chart-builder/config-builder/function-convertor/TableFunctionConvertor';
import { QuerySettingResolver } from '@/shared/resolver/query-setting-resolver/QuerySettingResolver';
import { QuerySettingResolverBuilder } from '@/shared/resolver/query-setting-resolver/QuerySettingResolverBuilder';
import { DateConditionBuilder, DateHistogramConditionCreator } from '@chart/date-filter/date-histogram-conditon-builder/DateHistogramConditionBuilder';

export class ChartBuilderModule implements BaseModule {
  configuration(): void {
    this.bindSettingBuilder();
    this.bindQueryBuilder();
    this.bindCompareResolver();
    this.bindCustomRenderService();
    this.bindFunctionConvertResolver();
    this.bindDashboardSettingVersionResolver();
    this.bindDateHistogramCreator();
  }

  private bindQueryBuilder(): void {
    const seriesHandler = new SeriesQuerySettingHandler();
    const stackingHandler = new StackingSeriesQuerySettingHandler();
    const drilldownHandler = new DrilldownQuerySettingHandler();
    const tableHandler = new TableQuerySettingHandler();
    const tabFilterHandler = new TabFilterQuerySettingHandler();
    const measureControlHandler = new GroupMeasureControlQuerySettingHandler();
    const controlQuerySettingHandler = new ControlQuerySettingHandler();
    const builder: QuerySettingResolver = new QuerySettingResolverBuilder()
      .add(ChartType.Line, seriesHandler)
      .add(ChartType.Area, seriesHandler)
      .add(ChartType.Bar, seriesHandler)
      .add(ChartType.Column, seriesHandler)
      .add(ChartType.Lollipop, seriesHandler)
      .add(ChartType.LineStock, new StockQuerySettingHandler())
      .add(ChartType.Pie, new PieQuerySettingHandler())
      .add(ChartType.Funnel, new FunnelQuerySettingHandler())
      .add(ChartType.Pyramid, new PyramidQuerySettingHandler())
      .add(ChartType.Scatter, new ScatterQuerySettingHandler())
      .add(ChartType.Bubble, new BubbleQuerySettingHandler())
      .add(ChartType.Pareto, new ParetoQuerySettingHandler())
      .add(ChartType.BellCurve, new BellCurveQuerySettingHandler())
      .add(ChartType.HeatMap, new HeatMapQuerySettingHandler())
      .add(ChartType.Gauges, new GaugeQuerySettingHandler())
      .add(ChartType.Kpi, new NumberQuerySettingHandler())
      .add(ChartType.BarDrillDown, drilldownHandler)
      .add(ChartType.ColumnDrillDown, drilldownHandler)
      .add(ChartType.PieDrillDown, new DrilldownPieQuerySettingHandler())
      .add(ChartType.Table, tableHandler)
      .add(ChartType.WordCloud, new WordCloudQuerySettingHandler())
      .add(ChartType.TreeMap, new TreeMapQuerySettingHandler())
      .add(ChartType.StackedBar, stackingHandler)
      .add(ChartType.StackedColumn, stackingHandler)
      .add(ChartType.StackedLine, stackingHandler)
      .add(ChartType.Histogram, new HistogramQuerySettingHandler())
      .add(ChartType.Map, new MapQuerySettingHandler())
      .add(ChartType.TabFilter, tabFilterHandler)
      .add(ChartType.SingleChoice, tabFilterHandler)
      .add(ChartType.MultiChoice, tabFilterHandler)
      .add(ChartType.DropDown, tabFilterHandler)
      .add(ChartType.TabInnerFilter, tabFilterHandler)
      .add(ChartType.SingleChoiceFilter, tabFilterHandler)
      .add(ChartType.MultiChoiceFilter, tabFilterHandler)
      .add(ChartType.DropDownFilter, tabFilterHandler)
      .add(ChartType.PivotTable, new PivotQuerySettingHandler())
      .add(ChartType.Parliament, new ParliamentQuerySettingHandler())
      .add(ChartType.SpiderWeb, new SpyderWebQuerySettingHandler())
      .add(ChartType.Sankey, new SankeyQuerySettingHandler())
      .add(ChartType.SlicerFilter, new SlicerFilterQuerySettingHandler())
      .add(ChartType.DateSelectFilter, new DateSelectFilterQuerySettingHandler())
      .add(ChartType.InputFilter, new InputFilterQuerySettingHandler())
      .add(ChartType.FlattenTable, new FlattenTableQuerySettingHandler())
      .add(ChartType.FlattenPivotTable, new FlattenPivotQuerySettingHandler())
      .add(ChartType.Bullet, new BulletQuerySettingHandler())
      .add(ChartType.WindRose, stackingHandler)
      .add(ChartType.TabMeasurement, measureControlHandler)
      .add(ChartType.SingleChoiceMeasurement, measureControlHandler)
      .add(ChartType.MultiChoiceMeasurement, measureControlHandler)
      .add(ChartType.DropDownMeasurement, measureControlHandler)
      .add(ChartType.InputControl, controlQuerySettingHandler)
      .build();
    Container.bind(QuerySettingResolver)
      .factory(() => builder)
      .scope(Scope.Singleton);
  }

  private bindSettingBuilder(): void {
    const settingHandler = new SeriesVizSettingHandler();
    const stackHandler = new StackedVizSettingHandler();
    const drilldownHandler = new DrilldownVizSettingHandler();
    const tableHandler = new TableVizSettingHandler();
    const builder = new VizSettingResolverBuilder()
      .add(ChartType.Line, settingHandler)
      .add(ChartType.Area, settingHandler)
      .add(ChartType.Bar, settingHandler)
      .add(ChartType.Column, settingHandler)
      .add(ChartType.Lollipop, settingHandler)
      .add(ChartType.LineStock, settingHandler)
      .add(ChartType.Pie, new PieVizSettingHandler())
      .add(ChartType.Funnel, new FunnelVizSettingHandler())
      .add(ChartType.Pyramid, new PyramidVizSettingHandler())
      .add(ChartType.Scatter, new ScatterVizSettingHandler())
      .add(ChartType.Bubble, new BubbleVizSettingHandler())
      .add(ChartType.Pareto, new ParetoVizSettingHandler())
      .add(ChartType.HeatMap, new HeatMapVizSettingHandler())
      .add(ChartType.Gauges, new GaugeVizSettingHandler())
      .add(ChartType.Kpi, new NumberVizSettingHandler())
      .add(ChartType.ColumnDrillDown, drilldownHandler)
      .add(ChartType.BarDrillDown, drilldownHandler)
      .add(ChartType.PieDrillDown, new DrilldownPieVizSettingHandler())
      .add(ChartType.Table, tableHandler)
      .add(ChartType.WordCloud, new WordCloudVizSettingHandler())
      .add(ChartType.BellCurve, new BellCurveVizSettingHandler())
      .add(ChartType.TreeMap, new TreeMapVizSettingHandler())
      .add(ChartType.StackedBar, stackHandler)
      .add(ChartType.StackedColumn, stackHandler)
      .add(ChartType.StackedLine, stackHandler)
      .add(ChartType.Histogram, new HistogramVizSettingHandler())
      .add(ChartType.TabFilter, new TabFilterVizSettingHandler())
      .add(ChartType.Map, new MapVizHandler())
      .add(ChartType.PivotTable, new PivotTableSettingHandler())
      .add(ChartType.Parliament, new ParliamentVizSettingHandler())
      .add(ChartType.SpiderWeb, new SpiderWebVizSettingHandler())
      .add(ChartType.Sankey, new SankeyVizSettingHandler())
      .add(ChartType.FlattenPivotTable, new FlattenPivotTableSettingHandler())
      .add(ChartType.FlattenTable, new FlattenTableVizSettingHandler())
      .add(ChartType.Bullet, new GaugeVizSettingHandler())
      .add(ChartType.WindRose, stackHandler)
      .build();
    Container.bind(VizSettingResolver)
      .factory(() => builder)
      .scope(Scope.Singleton);
  }

  private bindCompareResolver() {
    const builders = new Map<VizSettingType, CompareBuilder>();
    builders.set(VizSettingType.NumberSetting, new NumberCompareBuilder()).set(VizSettingType.SeriesSetting, new SeriesCompareBuilder());
    Container.bindName(DIKeys.CompareBuilder).to(builders);
  }

  private bindCustomRenderService(): void {
    Container.bind(RenderProcessService)
      .factory(() => new DefaultRenderProcessService())
      .scope(Scope.Singleton);
    Container.bind(PageRenderService)
      .factory(() => new PageRenderServiceImpl(new BodyHTMLRender(), new CssRenderImpl(), new JSRenderImpl()))
      .scope(Scope.Singleton);
  }

  private bindFunctionConvertResolver() {
    const resolver = new FunctionConvertBuilder()
      .add(ChartType.Table, new TableFunctionConvertor())
      .add(ChartType.FlattenTable, new TableFunctionConvertor())
      .add(ChartType.Bubble, new BubbleFunctionConvertor())
      .add(ChartType.Scatter, new ScatterFunctionConvertor())
      .build();
    Container.bind(FunctionConvertResolver)
      .factory(() => resolver)
      .scope(Scope.Singleton);
  }

  private bindDashboardSettingVersionResolver() {
    const resolver = new DashboardSettingVersionBuilder().add(new DefaultDashboardSettingConvertor()).build();
    Container.bind(DashboardSettingVersionResolver)
      .factory(() => resolver)
      .scope(Scope.Singleton);
  }

  private bindDateHistogramCreator() {
    const creator = new DateConditionBuilder()
      //
      .add(DateConditionTypes.allTime, void 0, DateHistogramConditionTypes.allTime)
      .add(DateConditionTypes.earlierThan, void 0, DateHistogramConditionTypes.earlierThan)
      .add(DateConditionTypes.laterThan, void 0, DateHistogramConditionTypes.laterThan)
      //
      .add(DateConditionTypes.current, DateTypes.day, DateHistogramConditionTypes.currentDay)
      .add(DateConditionTypes.current, DateTypes.week, DateHistogramConditionTypes.currentWeek)
      .add(DateConditionTypes.current, DateTypes.month, DateHistogramConditionTypes.currentMonth)
      .add(DateConditionTypes.current, DateTypes.quarter, DateHistogramConditionTypes.currentQuarter)
      .add(DateConditionTypes.current, DateTypes.year, DateHistogramConditionTypes.currentYear)
      //
      .add(DateConditionTypes.last, DateTypes.minute, DateHistogramConditionTypes.lastNMinutes)
      .add(DateConditionTypes.last, DateTypes.hour, DateHistogramConditionTypes.lastNHours)
      .add(DateConditionTypes.last, DateTypes.day, DateHistogramConditionTypes.lastNDays)
      .add(DateConditionTypes.last, DateTypes.week, DateHistogramConditionTypes.lastNWeeks)
      .add(DateConditionTypes.last, DateTypes.month, DateHistogramConditionTypes.lastNMonths)
      .add(DateConditionTypes.last, DateTypes.year, DateHistogramConditionTypes.lastNYears)
      //
      .add(DateConditionTypes.between, void 0, DateHistogramConditionTypes.between)
      .add(DateConditionTypes.betweenAndInclude, void 0, DateHistogramConditionTypes.betweenAndIncluding)
      .build();
    Container.bind(DateHistogramConditionCreator)
      .factory(() => creator)
      .scope(Scope.Singleton);
  }
}
