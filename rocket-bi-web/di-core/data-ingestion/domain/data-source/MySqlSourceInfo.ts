import { DataSource } from '@core/data-ingestion/domain/response/DataSource';
import { DataSourceInfo } from './DataSourceInfo';
import { DataSourceType } from '@core/data-ingestion/domain/data-source/DataSourceType';
import { DataSources } from '@core/data-ingestion/domain/data-source/DataSources';
import { JdbcSource } from '@core/data-ingestion/domain/response/JdbcSource';
import { SourceId } from '@core/common/domain';
import { StringUtils } from '@/utils';
import { NewFieldData } from '@/screens/user-management/components/user-detail/AddNewFieldModal.vue';
import { Log } from '@core/utils';
export abstract class SourceWithExtraField {
  abstract extraFields: Record<string, string>;

  abstract setField(fielData: NewFieldData): void;

  abstract isExistField(fieldName: string): boolean;

  static isSourceExtraField(source: DataSourceInfo | SourceWithExtraField): source is SourceWithExtraField {
    return !!(source as SourceWithExtraField).setField;
  }
}
export class MySqlSourceInfo implements DataSourceInfo, SourceWithExtraField {
  className = DataSources.JdbcSource;
  sourceType = DataSourceType.MySql;
  id: SourceId;
  orgId: string;
  displayName: string;
  host: string;
  port: string;
  username: string;
  password: string;
  lastModify: number;
  extraFields: Record<string, string>;

  constructor(
    id: SourceId,
    orgId: string,
    displayName: string,
    host: string,
    port: string,
    username: string,
    password: string,
    lastModify: number,
    extraFields: Record<string, string>
  ) {
    this.id = id;
    this.orgId = orgId;
    this.displayName = displayName;
    this.host = host;
    this.port = port;
    this.username = username;
    this.password = password;
    this.lastModify = lastModify;
    this.extraFields = extraFields;
  }

  static fromJdbcSource(obj: JdbcSource): DataSourceInfo {
    const url = obj.jdbcUrl;
    const [host, remain] = url.split('//')[1].split(':');
    const [port, extra] = remain.split('?');
    const extraFields: Record<string, string> = this.getExtraFields(extra);
    return new MySqlSourceInfo(obj.id, obj.orgId, obj.displayName, host, port, obj.username, obj.password, obj.lastModify, extraFields);
  }

  static fromObject(obj: any): MySqlSourceInfo {
    return new MySqlSourceInfo(
      obj.id ?? DataSourceInfo.DEFAULT_ID,
      obj.orgId ?? DataSourceInfo.DEFAULT_ID.toString(),
      obj.displayName ?? '',
      obj.host ?? '',
      obj.port ?? '',
      obj.username ?? '',
      obj.password ?? '',
      obj.lastModify ?? 0,
      obj.extraFields ?? { connectTimeout: '30000' }
    );
  }

  toDataSource(): DataSource {
    const extraFields = this.extraFieldsAsString?.length === 0 ? '' : `?${this.extraFieldsAsString}`;
    const jdbcUrl = `jdbc:mysql://${this.host}:${this.port}${extraFields}`;
    const request = new JdbcSource(this.id, this.orgId, this.sourceType, this.displayName, jdbcUrl, this.username, this.password, this.lastModify);
    return request;
  }

  private static getExtraFields(text: string | undefined): Record<string, string> {
    const result: Record<string, string> = {};
    const extraAsString = text !== undefined ? text : 'connectTimeout=30000';
    const containerExtraField = StringUtils.isNotEmpty(extraAsString);
    if (containerExtraField) {
      extraAsString.split('&').forEach(extraAsString => {
        const [key, value] = extraAsString.split('=');
        result[key] = value;
      });
    }
    return result;
  }

  private get extraFieldsAsString(): string {
    return JSON.stringify(this.extraFields)
      .replace('{', '')
      .replace('}', '')
      .replaceAll(/['"]+/g, '')
      .replaceAll(':', '=')
      .replaceAll(',', '&');
  }

  getDisplayName(): string {
    return this.displayName;
  }

  setField(fielData: NewFieldData): void {
    this.extraFields[fielData.fieldName] = fielData.fieldValue;
  }
  isExistField(fieldName: string): boolean {
    return this.extraFields[fieldName] !== undefined;
  }
}
