import { Action, getModule, Module, Mutation, VuexModule } from 'vuex-module-decorators';
import store from '@/store';
import { Stores } from '@/shared';
import { Job, JobInfo } from '@core/data-ingestion/domain/job/Job';
import { Inject } from 'typescript-ioc';
import { JobService } from '@core/data-ingestion/service/JobService';
import { Log } from '@core/utils';
import { DIException, JobId } from '@core/common/domain';
import { ListingResponse, SortRequest } from '@core/data-ingestion';
import { ForceMode } from '@core/lake-house/domain/lake-job/ForceMode';
import { ListingRequest } from '@core/lake-house/domain/request/listing-request/ListingRequest';

@Module({ dynamic: true, namespaced: true, store: store, name: Stores.jobStore })
class JobStore extends VuexModule {
  jobList: JobInfo[] = [];
  totalRecord = 0;
  defaultDatasourceIcon = require('@/assets/icon/data_ingestion/datasource/ic_default.svg');

  @Inject
  private readonly jobService!: JobService;

  @Action
  loadJobList(payload: { from: number; size: number; sorts?: SortRequest[]; keyword: string }) {
    const { from, size, sorts, keyword } = payload;
    return this.jobService
      .list(new ListingRequest(keyword, from, size, sorts))
      .then(response => {
        this.setJobList(response);
      })
      .catch(e => {
        const exception = DIException.fromObject(e);
        Log.error('JobStore::loadJobList::exception::', exception.message);
        throw new DIException(exception.message);
      });
  }

  @Mutation
  setJobList(response: ListingResponse<JobInfo>) {
    this.jobList = response.data;
    this.totalRecord = response.total;
  }

  @Action
  deleteJob(jobId: JobId) {
    return this.jobService.delete(jobId);
  }

  @Action
  create(job: Job): Promise<JobInfo> {
    return this.jobService.create(job);
  }
  @Action
  createMulti(payload: { job: Job; tables: string[] }): Promise<boolean> {
    const { job, tables } = payload;
    return this.jobService.multiCreate(job, tables);
  }

  @Action
  update(job: Job) {
    return this.jobService.update(job.jobId, job);
  }

  @Action
  testJobConnection(job: Job): Promise<boolean> {
    return this.jobService.testConnection(job);
    // return Promise.resolve(true);
  }

  @Action
  forceSync(payload: { jobId: JobId; date: number; mode: ForceMode }): Promise<boolean> {
    const { jobId, date, mode } = payload;
    return this.jobService.forceSync(jobId, date, mode);
  }

  @Action
  cancel(job: Job): Promise<boolean> {
    return this.jobService.cancel(job.jobId);
  }
}

export const JobModule: JobStore = getModule(JobStore);
