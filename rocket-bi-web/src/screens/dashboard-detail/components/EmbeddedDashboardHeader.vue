<template>
  <div>
    <div class="row no-gutters text-center control-bar flex-nowrap overflow-auto">
      <div class="dashboard-title-container d-flex flex-row align-items-center overflow-hidden">
        <div class="regular-text-24 m-0 text-left dashboard-title">{{ title || 'Untitled' }}</div>
        <transition name="fade">
          <template v-if="showEditComponent()">
            <i class="di-icon-edit edit-icon btn-icon-border" @click="onClickRename"></i>
          </template>
        </transition>
      </div>
      <div class="col-auto flex-shrink-1">
        <EmbeddedDashboardControlBar :showResetFilters="haveFilters" />
      </div>
      <DiRenameModal ref="renameDashboardModal" @rename="handleRenameDashboard" />
      <DiRenameModal ref="editChartTextModal" @rename="handleRenameWidget" />
    </div>
    <div v-if="enableFilter" class="filters-bar">
      <FilterBar
        ref="filterBar"
        :filters="allFilters"
        class="user-profile-filter"
        @onApplyFilter="handleApplyFilter"
        @onRemoveAt="handleRemoveFilterAt"
        @onStatusChange="handleFilterStatusChange"
        @onValuesChange="handleValuesFilterChange"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { CalendarData } from '@/shared/models';
import { Component, Prop, Provide, Ref, Vue, Watch } from 'vue-property-decorator';
import { mapGetters, mapState } from 'vuex';
import { DashboardId, DIException, DynamicFilter, FieldDetailInfo, Widget } from '@core/common/domain';
import { DashboardMode, DateRange, isEdit, Routers } from '@/shared';
import { DashboardModule, FilterModule, WidgetModule } from '@/screens/dashboard-detail/stores';

import DashboardControlBar from '@/screens/dashboard-detail/components/dashboard-control-bar/DashboardControlBar.vue';
import { Stores } from '@/shared/enums/Stores';
import FilterBar from '@/shared/components/FilterBar.vue';
import { ListUtils } from '@/utils';
import { DataManager } from '@core/common/services';
import { Di } from '@core/common/modules';
import { Log } from '@core/utils';
import DiRenameModal from '@/shared/components/DiRenameModal.vue';
import { PopupUtils } from '@/utils/PopupUtils';
import { RouterUtils } from '@/utils/RouterUtils';
import { DashboardEvents } from '@/screens/dashboard-detail/enums/DashboardEvents';
import EmbeddedDashboardControlBar from '@/screens/dashboard-detail/components/dashboard-control-bar/EmbeddedDashboardControlBar.vue';

@Component({
  components: { EmbeddedDashboardControlBar, DashboardControlBar, FilterBar, DiRenameModal },
  computed: {
    ...mapState(Stores.dashboardStore, ['dashboardId']),
    ...mapGetters(Stores.dashboardStore, ['title']),
    ...mapState(Stores.dashboardModeStore, ['mode'])
  }
})
export default class EmbeddedDashboardHeader extends Vue {
  private readonly mode!: DashboardMode;
  private readonly title!: string;
  private readonly dashboardId!: DashboardId;

  @Prop({ type: Boolean, default: false })
  private readonly isLogin!: boolean;

  @Ref()
  private readonly renameDashboardModal!: DiRenameModal;
  @Ref()
  private readonly editChartTextModal!: DiRenameModal;

  @Ref()
  private readonly filterBar?: FilterBar;

  @Prop({ required: false, type: Boolean, default: true })
  private readonly enableFilter!: boolean;

  private mainFilters: DynamicFilter[] = [];
  private routerFilters: DynamicFilter[] = [];

  private get allFilters(): DynamicFilter[] {
    return [...this.mainFilters, ...this.routerFilters];
  }

  private get dataManager(): DataManager {
    return Di.get(DataManager);
  }

  private get haveFilters(): boolean {
    return ListUtils.isNotEmpty(this.mainFilters);
  }

  mounted() {
    this.$root.$on(DashboardEvents.ShowEditChartTitleModal, this.onShowEditChartTitleModal);
  }

  beforeDestroy() {
    this.$root.$on(DashboardEvents.ShowEditChartTitleModal, this.onShowEditChartTitleModal);
  }

  private onShowEditChartTitleModal(widget: Widget) {
    this.editChartTextModal?.show(widget.name, widget);
  }

  @Provide()
  handleResetFilter() {
    this.mainFilters = [];
    this.applyMainFilters();
    this.saveMainFilters();
  }

  @Watch('dashboardId', { immediate: true })
  private onDashboardIdChanged() {
    if (this.dashboardId) {
      this.mainFilters = this.dataManager.getMainFilters(this.dashboardId.toString());
      this.routerFilters = RouterUtils.getFilters(this.$route);
    }
  }

  private showEditComponent(): boolean {
    return isEdit(this.mode);
  }

  private async handleRenameDashboard(newName: string): Promise<void> {
    try {
      this.renameDashboardModal.hide();
      await DashboardModule.handleRenameDashboard(newName);
    } catch (ex) {
      this.handleError(ex);
    }
  }

  private handleError(ex: any) {
    const exception = DIException.fromObject(ex);
    Log.error('DashboardHeader::handleError::', ex);
    PopupUtils.showError(exception.message);
  }

  private onClickRename(): void {
    this.renameDashboardModal.show(this.title);
  }

  @Provide()
  private applyMainDateFilter(calendar: CalendarData) {
    FilterModule.setMainDateCalendar(calendar);
    FilterModule.setCompareRange(null);
    FilterModule.handleMainDateFilterChange();
  }

  @Provide()
  private applyCompare(firstTime: DateRange, compareRange: DateRange) {
    FilterModule.setChosenRange(firstTime);
    FilterModule.setCompareRange(compareRange);
    FilterModule.handleMainDateFilterChange();
  }

  @Provide()
  private applyMainDateAllTime() {
    FilterModule.setChosenRange(null);
    FilterModule.setCompareRange(null);
    FilterModule.handleMainDateFilterChange();
  }

  private async handleRenameWidget(newName: string, currentWidget: Widget): Promise<void> {
    if (currentWidget) {
      try {
        this.editChartTextModal.hide();
        await WidgetModule.updateTitleWidget({ widget: currentWidget, newName: newName });
      } catch (ex) {
        this.handleError(ex);
      }
    }
  }

  private applyMainFilters() {
    // trick
    FilterModule.setMainFilters(this.allFilters);
    FilterModule.setRouterFilters(this.routerFilters);
    FilterModule.handleMainDateFilterChange();
  }

  private handleRemoveFilterAt(index: number) {
    const inLocalStorage = this.mainFilters.length > index;
    if (inLocalStorage) {
      this.mainFilters = ListUtils.removeAt(this.mainFilters, index);
    } else {
      this.routerFilters = ListUtils.removeAt(this.routerFilters, index - this.mainFilters.length);
    }
    this.applyMainFilters();
    this.saveMainFilters();
  }

  private handleApplyFilter(appliedFilter: DynamicFilter) {
    this.applyMainFilters();
    this.saveMainFilters();
  }

  private handleFilterStatusChange(filter: DynamicFilter) {
    this.applyMainFilters();
    this.saveMainFilters();
  }

  private handleValuesFilterChange(filter: DynamicFilter) {
    this.applyMainFilters();
    this.saveMainFilters();
  }

  @Provide()
  private handleAddNewFilter(profileField: FieldDetailInfo) {
    const filter = DynamicFilter.from(profileField.field, profileField.displayName, profileField.isNested);
    this.mainFilters.push(filter);
    this.saveMainFilters();
    this.filterBar?.showFilter(this.mainFilters.indexOf(filter));
  }

  private saveMainFilters() {
    this.dataManager.saveMainFilters(this.dashboardId.toString(), this.mainFilters);
  }

  private handleBack() {
    Log.debug('handleBack::', DashboardModule.myDataPage);
    if (DashboardModule.myDataPage && DashboardModule.myDataPage.name && DashboardModule.myDataPage.name != Routers.ChartBuilder) {
      this.$router.push({
        path: DashboardModule.myDataPage.fullPath
      });
    } else {
      this.$router.push({ name: Routers.AllData });
    }
  }
}
</script>

<style lang="scss" scoped>
.dashboard-title-container {
  flex: 1;
  width: max-content;
  min-width: 200px;
}
.dashboard-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

::v-deep {
  .b-icon.bi {
    vertical-align: middle !important;
  }

  .control-bar {
    align-items: center;
    min-height: 38px;
  }

  .ml-auto {
    float: left;
  }

  .edit-icon {
    margin-left: 8px;
    padding: 8px;
    opacity: 0.8;
  }

  .filters-bar {
    margin-left: 5px;
  }
}
</style>
