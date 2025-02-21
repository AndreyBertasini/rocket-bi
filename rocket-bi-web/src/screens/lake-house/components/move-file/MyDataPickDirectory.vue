<template>
  <ContextMenu
    id="my-data-directory-picker"
    ref="vueContext"
    tag="div"
    minWidth="314px"
    :ignoreOutsideClass="listIgnoreClassForContextMenu"
    :close-on-click="true"
    :z-index="1"
  >
    <div class="move-file-container">
      <MoveFile
        ref="moveFile"
        display-key="name"
        :parentDirectoryName="currentDirectory.name"
        :directories="directories"
        :files-max-height="236"
        submit-title="Select"
        :showBackAtParentDirectory="!isRootDirectory"
        @directoryClick="handleClickDirectory"
        @back="handleBackDirectory(parentDirectory.id)"
        @createDirectory="handleCreateDirectory"
        @submit="handlePickFolder(currentDirectory.id)"
      />
    </div>
  </ContextMenu>
</template>
<script lang="ts">
import { Component, Ref, Vue } from 'vue-property-decorator';
import MoveFile from '@/screens/lake-house/components/move-file/MoveFile.vue';
import { Log } from '@core/utils';
import { PopupUtils } from '@/utils/PopupUtils';
import { CreateDirectoryRequest, DIException, Directory, DirectoryId, DirectoryPagingRequest, DirectoryType } from '@core/common/domain';
import { ApiExceptions } from '@/shared';
import ContextMenu from '@/shared/components/ContextMenu.vue';
import { DirectoryListingHandler } from '@/screens/directory/views/mydata/directory-listing-handler/DirectoryListingHandler';
import { MyDataDirectoryListingHandler } from '@/screens/directory/views/mydata/directory-listing-handler/MyDataDirectoryListingHandler';
import { DefaultDirectoryId } from '@/screens/directory/views/mydata/DefaultDirectoryId';
import { DirectoryService } from '@core/common/services';
import { Di } from '@core/common/modules';
import { DirectoryModule } from '@/screens/directory/store/DirectoryStore';
import { Inject } from 'typescript-ioc';

@Component({
  components: { MoveFile, ContextMenu }
})
export default class MyDataPickDirectory extends Vue {
  private listIgnoreClassForContextMenu = ['action-more'];
  private parentDirectory: { id: DirectoryId; name: string } = { id: DefaultDirectoryId.MyData, name: 'My data' };
  private currentDirectory: { id: DirectoryId; name: string } = { id: DefaultDirectoryId.MyData, name: 'My data' };
  // private loadHandler: DirectoryListingHandler = new MyDataDirectoryListingHandler();
  private rootId: DirectoryId = DefaultDirectoryId.MyData;

  private excludeDirectoryIds: DirectoryId[] = [];

  private currentDirectories: Directory[] = [];

  private data?: any = null;

  @Inject
  private readonly directoryService!: DirectoryService;

  @Ref()
  private readonly moveFile!: MoveFile;

  @Ref()
  private readonly vueContext!: ContextMenu;

  private get directories(): Directory[] {
    return this.currentDirectories.filter(directory => directory.directoryType === DirectoryType.Directory && !this.excludeDirectoryIds.includes(directory.id));
  }

  private async handleBackDirectory(id: DirectoryId) {
    if (id !== DefaultDirectoryId.MyData) {
      await DirectoryModule.getDirectory(id)
        .then(directory => this.handleClickDirectory(directory))
        .catch(ex => Log.error(ex));
    }
  }

  private async handleLoadDirectoryListing(id: DirectoryId, pagination: DirectoryPagingRequest) {
    this.$nextTick(async () => {
      try {
        this.moveFile.showLoading();
        await this.loadDirectories(id, pagination);
        this.moveFile.showLoaded();
      } catch (e) {
        Log.error('MyDataPickFile::loadDirectoryListing::error::', e.message);
        this.moveFile.showError(e.message);
      }
    });
  }

  private async loadDirectories(id: DirectoryId, pagination: DirectoryPagingRequest) {
    this.currentDirectories = await this.directoryService.list(id, pagination);
  }

  private showContextMenu(event: Event) {
    this.vueContext.show(event, []);
  }

  private closeContextMenu() {
    this.vueContext.hide();
  }

  async show(event: Event, excludeDirectoryIds?: DirectoryId[], data?: any) {
    setTimeout(async () => {
      try {
        if (excludeDirectoryIds) {
          this.excludeDirectoryIds = excludeDirectoryIds;
        }
        if (data) {
          this.data = data;
        }
        this.showContextMenu(event);
        await this.initData();
        const pagination = DirectoryPagingRequest.default();
        await this.handleLoadDirectoryListing(this.currentDirectory.id, pagination);
      } catch (e) {
        Log.error('LakeExplorerMoveFile::handleShowPopover::error::', e.message);
      }
    }, 150);
  }

  private async initData() {
    this.moveFile.showLoading();
    const root = await this.directoryService.getRootDir();
    this.parentDirectory = { id: root.parentId, name: 'My data' };
    this.currentDirectory = { id: root.id, name: 'My data' };
    this.rootId = root.id;
  }

  private async handleClickDirectory(directory: Directory) {
    try {
      const isRoot = directory.id === DefaultDirectoryId.MyData;
      if (!isRoot) {
        const pagination = DirectoryPagingRequest.default();
        await this.handleLoadDirectoryListing(directory.id, pagination);
        this.updateCurrentDirectory(directory);
      }
    } catch (e) {
      Log.error('LakeExplorerMoveFile::handleClickDirectory::error::', e.message);
    }
  }

  private async handlePickFolder(id: DirectoryId) {
    try {
      this.$emit('selectDirectory', id, this.data);
    } catch (e) {
      const ex = DIException.fromObject(e);
      this.showError(ex);
    } finally {
      this.closeContextMenu();
      this.moveFile.setSubmitLoading(false);
    }
  }

  private showError(ex: DIException) {
    if (ex.reason === ApiExceptions.alreadyExisted) {
      //@ts-ignored
      this.$alert.fire({
        icon: 'error',
        title: 'Can not complete action',
        html: ex.message
      });
    } else {
      Log.error('LakeExplorerMoveFile::handleMoveFile::error::', ex.message);
      PopupUtils.showError(ex.message);
    }
  }

  private updateCurrentDirectory(directory: Directory) {
    const isRoot = directory.id === this.rootId;
    this.parentDirectory = { id: directory.parentId, name: '' };
    this.currentDirectory = { id: directory.id, name: isRoot ? 'My Data' : directory.name };
  }

  private async handleCreateDirectory(folderName: string) {
    try {
      if (this.currentDirectory) {
        const directory = await this.createDirectory(this.currentDirectory.id, folderName);
        await this.handleClickDirectory(directory);
        this.moveFile.toggleCreateFolder();
      }
    } catch (e) {
      Log.error('LakeExplorerMoveFile::handleCreateDirectory::error::', e.message);
      this.moveFile.showErrorCreateFolder(e.message);
    }
  }

  private createDirectory(parentId: DirectoryId, name: string): Promise<Directory> {
    const request = new CreateDirectoryRequest({
      name: name,
      isRemoved: false,
      parentId: parentId,
      directoryType: DirectoryType.Directory
    });
    const directoryService = Di.get(DirectoryService);
    return directoryService.create(request);
  }

  private get isRootDirectory(): boolean {
    return this.currentDirectory.id === this.rootId;
  }
}
</script>
