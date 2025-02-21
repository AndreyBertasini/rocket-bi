import { Component, Ref, Vue, Prop, Watch, Emit } from 'vue-property-decorator';
import { Column, DatabaseInfo, DatabaseSchema, DIException, Field, TableColumn, TableSchema } from '@core/common/domain';
import { IconUtils, ListUtils } from '@/utils';
import TableCreationFromQueryModal from '@/screens/data-management/components/TableCreationFromQueryModal.vue';
import VueContext from 'vue-context';
import CalculatedFieldModal from '@/screens/chart-builder/config-builder/database-listing/CalculatedFieldModal.vue';
import { LabelNode } from '@/shared';
import DataListing from '@/screens/dashboard-detail/components/widget-container/charts/action-widget/DataListing.vue';
import { Modals } from '@/utils/Modals';
import { Log } from '@core/utils';
import { DatabaseSchemaModule } from '@/store/modules/data-builder/DatabaseSchemaStore';
import { PopupUtils } from '@/utils/PopupUtils';
import { DeleteFieldData } from '@/screens/chart-builder/config-builder/database-listing/CalculatedFieldData';
import { cloneDeep } from 'lodash';
import { StringUtils } from '@/utils/StringUtils';
import { TrackEvents } from '@core/tracking/enum/TrackEvents';
import { AtomicAction, Track } from '@/shared/anotation';
import { TrackingUtils } from '@core/tracking/TrackingUtils';
import DiRenameModal from '@/shared/components/DiRenameModal.vue';
import { DataManagementModule } from '@/screens/data-management/store/DataManagementStore';

interface TreeViewInfo {
  [key: string]: TreeViewDatabase;
}

export interface TreeViewDatabase {
  show: boolean;
  table: {
    [key: string]: boolean;
  };
}

enum DataManagementAction {
  //Calculated Field
  AddCalculatedField = 'add_calculated_field',
  EditCalculatedField = 'edit_calculated_field',
  DeleteCalculatedField = 'delete_calculated_field',
  //Measurement Field
  AddMeasurementField = 'add_measurement_field',
  EditMeasurementField = 'edit_measurement_field',
  DeleteMeasurementField = 'delete_measurement_field',
  DeleteTable = 'delete_table'
}

export enum DatabaseTreeViewMode {
  Editing = 'editing_mode',
  QueryMode = 'query_mode'
}

@Component({
  components: {
    CalculatedFieldModal,
    VueContext,
    DataListing,
    DiRenameModal
  }
})
export default class DatabaseTreeView extends Vue {
  private readonly trackEvents = TrackEvents;
  private isShowKeyword = false;
  private keyword = '';
  private treeViewInfo: TreeViewInfo = {};

  private filteredDatabaseSchemas: DatabaseSchema[] = [];

  private readonly DatabaseTreeViewMode = DatabaseTreeViewMode;

  @Prop({ type: Boolean })
  private loading!: boolean;

  @Prop({ type: Boolean, default: false })
  private isDisableCreateMode!: boolean;

  @Prop({ type: Boolean, default: false })
  private showColumns!: boolean;

  @Prop({ type: Array, default: () => [] })
  private schemas!: DatabaseSchema[];

  @Prop({ required: false, type: String, default: DatabaseTreeViewMode.Editing })
  private readonly mode!: DatabaseTreeViewMode;

  // selectedTable: TableSchema | null = null;

  @Ref('keyword')
  private readonly keywordEle?: HTMLElement;

  @Ref()
  private readonly tableCreationModal!: TableCreationFromQueryModal;

  @Ref()
  private readonly databaseCreationModal!: DiRenameModal;

  @Ref()
  private readonly tableMenu?: VueContext;

  @Ref()
  private readonly columnMenu?: VueContext;

  @Ref()
  private readonly calculatedFieldModal?: CalculatedFieldModal;

  @Ref()
  private readonly vs: any;

  @Watch('keyword', { immediate: true })
  private onKeywordChanged(keyword: string) {
    if (StringUtils.isEmpty(keyword)) {
      this.filteredDatabaseSchemas = this.schemas;
      // this.expandedDatabases =
    } else {
      this.filteredDatabaseSchemas = this.searchDatabaseSchemas(this.schemas, keyword);
      this.treeViewInfo = this.expandAll(this.filteredDatabaseSchemas);
    }
  }

  @Watch('schemas', { immediate: true })
  private onDatabaseSchemasChanged(databaseSchemas: DatabaseSchema[]) {
    if (StringUtils.isEmpty(this.keyword)) {
      this.filteredDatabaseSchemas = databaseSchemas;
    } else {
      this.filteredDatabaseSchemas = this.searchDatabaseSchemas(databaseSchemas, this.keyword);
      this.treeViewInfo = this.expandAll(this.filteredDatabaseSchemas);
    }
  }

  private expandAll(databaseSchemas: DatabaseSchema[]) {
    const treeViewInfo: TreeViewInfo = {};
    databaseSchemas.forEach(databaseSchema => {
      treeViewInfo[databaseSchema.name] = {
        show: true,
        table: {}
      };
    });
    return treeViewInfo;
  }

  private searchDatabaseSchemas(databases: DatabaseSchema[], keyword: string): DatabaseSchema[] {
    const listDatabases: DatabaseSchema[] = [];
    databases.forEach(database => {
      if (StringUtils.isIncludes(keyword, database.displayName || database.name)) {
        listDatabases.push(database);
      } else {
        const tables: TableSchema[] = database.searchTables(keyword);
        if (ListUtils.isNotEmpty(tables)) {
          const newDatabase: DatabaseSchema = cloneDeep(database);
          newDatabase.setTables(tables);
          listDatabases.push(newDatabase);
        }
      }
    });
    return listDatabases;
  }

  private resetKeyword() {
    this.keyword = '';
    this.isShowKeyword = false;
  }

  showKeyword() {
    this.isShowKeyword = true;
    this.$nextTick(() => {
      this.keywordEle?.focus();
    });
  }

  private hideKeyword() {
    if (!this.keyword) {
      this.isShowKeyword = false;
    }
  }

  private toggleDatabase(schema: DatabaseSchema) {
    const isShowing = this.treeViewInfo[schema.name]?.show;
    this.$set(this.treeViewInfo, schema.name, {
      show: !isShowing,
      table: {}
    });
    this.$emit('toggleDatabase', schema, !isShowing);
  }

  private toggleTable(schema: DatabaseSchema, table: TableSchema) {
    PopupUtils.hideAllPopup();
    if (!this.treeViewInfo[schema.name]) {
      this.$set(this.treeViewInfo, schema.name, {
        show: !this.treeViewInfo[schema.name].show,
        table: {}
      });
    }
    this.$set(this.treeViewInfo[schema.name].table, table.name, !this.treeViewInfo[schema.name].table[table.name]);
  }

  private isExpandedDatabase(schema: DatabaseSchema) {
    return this.treeViewInfo[schema.name]?.show;
  }

  private isExpandedTable(schema: DatabaseSchema, table: TableSchema) {
    return this.treeViewInfo[schema.name]?.table?.[table.name];
  }

  private getColumnIcon(column: Column) {
    return IconUtils.getIconComponent(column);
  }

  private get tableActions(): LabelNode[] {
    return [
      { label: 'Add calculated field', type: DataManagementAction.AddCalculatedField.toString() },
      { label: 'Add measure', type: DataManagementAction.AddMeasurementField.toString() },
      { label: 'Delete', type: DataManagementAction.DeleteTable }
    ];
  }

  get fieldOptions(): LabelNode[] {
    return [
      {
        label: 'Edit Column',
        type: DataManagementAction.EditCalculatedField.toString()
      },
      {
        label: 'Delete Column',
        type: DataManagementAction.DeleteCalculatedField.toString()
      }
    ];
  }

  get measureFieldOptions(): LabelNode[] {
    return [
      {
        label: 'Edit Measurement',
        type: DataManagementAction.EditMeasurementField.toString()
      },
      {
        label: 'Delete Measurement',
        type: DataManagementAction.DeleteMeasurementField.toString()
      }
    ];
  }

  private showCreateDatabaseModal() {
    this.databaseCreationModal?.show('');
  }

  private showTableContextMenu(event: MouseEvent, table: TableSchema) {
    this.tableMenu?.open(event, { tableSchema: table });
  }

  @Emit('clickTable')
  private handleClickTable(table: TableSchema) {
    PopupUtils.hideAllPopup();
    return table;
  }

  @Emit('clickField')
  // fixme: field not include nested column
  private handleClickField(dbName: string, tableName: string, columnName: string) {
    PopupUtils.hideAllPopup();
    return Field.new(dbName, tableName, columnName, '');
  }

  private showColumnContextMenu(event: MouseEvent, table: TableSchema, column: Column) {
    // const field: Field | undefined = node.tag as Field;
    // const tableSchema: TableSchema | undefined = node.data as TableSchema;
    // const column: Column | undefined = tableSchema?.columns[node.ind];

    // const canShowMenu = node.isLeaf && field && tableSchema && column && column.isMaterialized();

    if (table && column?.isMaterialized()) {
      event.preventDefault();
      this.columnMenu?.open(event, { column: column, tableSchema: table, field: Field });
    }
  }

  private handleConfigTable(tableSchema: TableSchema, node: LabelNode) {
    const selectedAction: string | undefined = node.type as any;
    switch (selectedAction) {
      case DataManagementAction.AddCalculatedField:
        this.showCreateCalculatedFieldModal(tableSchema);
        this.tableMenu?.close();
        break;
      case DataManagementAction.AddMeasurementField:
        this.showCreateMeasurementFieldModal(tableSchema);
        this.tableMenu?.close();
        break;
      case DataManagementAction.DeleteTable:
        //drop table
        this.tableMenu?.close();
        // this.handleDropTable(tableSchema);
        TrackingUtils.track(TrackEvents.DatabaseTreeViewRemoveTable, {
          table_name: tableSchema.name,
          database_name: tableSchema.dbName
        });
        Modals.showConfirmationModal(`Are you sure to delete table '${tableSchema.displayName}'?`, {
          onOk: () => this.handleDropTable(tableSchema),
          onCancel: () => {
            Log.debug('onCancel');
          }
        });
        break;
    }
  }

  @Track(TrackEvents.DatabaseTreeViewRemoveTable, {
    table_name: (_: DatabaseTreeView, args: any) => args[0].name,
    database_name: (_: DatabaseTreeView, args: any) => args[0].dbName
  })
  private handleDropTable(tableSchema: TableSchema) {
    DatabaseSchemaModule.dropTable({ dbName: tableSchema.dbName, tblName: tableSchema.name })
      .then(isSuccess => {
        if (isSuccess) {
          DatabaseSchemaModule.selectDatabase(tableSchema.dbName).then(() => {
            this.$emit('dropTable', tableSchema);
          });
        } else {
          PopupUtils.showError(`Can't delete ${tableSchema.displayName}`);
          return Promise.reject(new DIException(`Can't delete ${tableSchema.displayName}`));
        }
      })
      .catch(err => {
        PopupUtils.showError(err.message);
      });
  }

  private showCreateCalculatedFieldModal(tableSchema: TableSchema): void {
    this.calculatedFieldModal?.showCreateModal(tableSchema);
  }

  private showCreateMeasurementFieldModal(tableSchema: TableSchema): void {
    this.calculatedFieldModal?.showCreateModal(tableSchema, false);
  }

  private async handleConfigColumn(tableSchema: TableSchema, column: Column, node: LabelNode) {
    Log.debug('handleConfigColumn::', tableSchema, column, node);
    const selectedAction: DataManagementAction | undefined = node.type as any;

    switch (selectedAction) {
      case DataManagementAction.DeleteCalculatedField:
        await this.warningDelete({
          title: 'Delete Calculated Field',
          content: column.displayName || column.name,
          onConfirm: async () => await this.deleteCalculatedField(tableSchema, column)
        });
        break;
      case DataManagementAction.EditCalculatedField:
        this.editCalculatedField(tableSchema, column);
        break;
      case DataManagementAction.EditMeasurementField:
        this.editMeasurementField(tableSchema, column);
        break;
      case DataManagementAction.DeleteMeasurementField:
        await this.warningDelete({
          title: 'Delete Measure Field',
          content: column.displayName || column.name,
          onConfirm: async () => await this.deleteMeasureField(tableSchema, column)
        });
        break;
    }

    this.columnMenu?.close();
  }

  private async warningDelete(payload: { title: string; content: string; onConfirm: () => void }) {
    const { title, content, onConfirm } = payload;
    // @ts-ignore
    const { isConfirmed } = await this.$alert.fire({
      icon: 'warning',
      title: title,
      html: `Are you sure you want to delete column <strong>${content}</strong>?`,
      confirmButtonText: 'Yes',
      showCancelButton: true,
      cancelButtonText: 'No'
      // showCancelButton: false
    });
    if (!isConfirmed) {
      return;
    } else {
      onConfirm();
    }
  }

  private async deleteCalculatedField(tableSchema: TableSchema, column: Column): Promise<void> {
    try {
      const deletingFieldData: DeleteFieldData = {
        dbName: tableSchema.dbName,
        tblName: tableSchema.name,
        fieldName: column.name
      };
      await DatabaseSchemaModule.deleteCalculatedField(deletingFieldData);
      await DatabaseSchemaModule.reload(tableSchema.dbName);
      this.$emit('deleteColumn', tableSchema, column);
    } catch (ex) {
      PopupUtils.showError(`Can not delete column ${column.displayName}`);

      const exception = DIException.fromObject(ex);
      Log.error('deleteCalculatedField::exception', exception);
    }
  }

  private async deleteMeasureField(tableSchema: TableSchema, column: Column): Promise<void> {
    try {
      const deletingFieldData: DeleteFieldData = {
        dbName: tableSchema.dbName,
        tblName: tableSchema.name,
        fieldName: column.name
      };
      await DatabaseSchemaModule.deleteMeasurementField(deletingFieldData);
      await DatabaseSchemaModule.reload(tableSchema.dbName);
      this.$emit('deleteColumn', tableSchema, column);
    } catch (ex) {
      PopupUtils.showError(`Can not delete column ${column.displayName}`);

      const exception = DIException.fromObject(ex);
      Log.error('deleteMeasureField::exception', exception);
    }
  }

  private editCalculatedField(tableSchema: TableSchema, column: Column) {
    this.calculatedFieldModal?.showEditModal(tableSchema, column);
  }

  private editMeasurementField(tableSchema: TableSchema, column: Column) {
    this.calculatedFieldModal?.showEditModal(tableSchema, column, false);
  }

  private async onUpdateTable(tableSchema: TableSchema) {
    await DatabaseSchemaModule.reload(tableSchema.dbName);
    this.$emit('updateTable', tableSchema);
  }

  private emitReloadData() {
    this.$emit('reload');
  }

  selectDatabase(db: DatabaseSchema) {
    if (!this.isExpandedDatabase(db)) {
      const isShowing = this.treeViewInfo[db.name]?.show;
      this.$set(this.treeViewInfo, db.name, {
        show: !isShowing,
        table: {}
      });
    }
    const element: HTMLElement | null = this.$el.querySelector(`[data-database=${db.name}]`);
    if (element) {
      this.vs.scrollBy(
        {
          dy: element.offsetTop - 180
        },
        300
      );
    }
  }

  @AtomicAction()
  handleCreateDatabase(dbName: string) {
    this.databaseCreationModal.loading = true;
    DataManagementModule.createDatabase(dbName)
      .then(this.handleOnCreateDatabaseSuccess)
      .catch(error => {
        Log.error('DatabaseTreeView::handleCreateDatabase::error::', error.message);
        this.databaseCreationModal.setError(error.message);
      });
  }

  async handleOnCreateDatabaseSuccess(databaseInfo: DatabaseInfo) {
    await DataManagementModule.searchAndSelectDatabase(databaseInfo.name);
    this.databaseCreationModal.loading = false;
    this.databaseCreationModal.hide();
  }
}
