<template>
  <LayoutContent>
    <LayoutHeader title="Plan Detail & Billing" icon="di-icon-dollar"></LayoutHeader>
    <div class="layout-content-panel">
      <div v-if="!inited" class="plan-and-billing-content">
        <div class="d-flex justify-content-center align-items-center w-100 h-100">
          <DiLoading></DiLoading>
        </div>
      </div>
      <PlanDetailComponent v-else-if="data && data.isPaidPlan" :planDetail="data" @cancelPlan="onCancelPlan" @modifyPlan="onModifyPlan"></PlanDetailComponent>
      <vuescroll v-else :ops="scrollOptions">
        <div class="plan-and-billing-content">
          <div class="org-settings-content-header">
            <div class="org-settings-content-header-title">
              <div v-if="countdown > 0">You can try this product for {{ dateLeft }} days.</div>
              <div v-else>Your trial has expired for 30 days.</div>
              <div class="org-settings-content-header-desc">
                This plan gives you access to free product trials, tutorials, and more. When you’re ready to upgrade, choose the plan that fits your needs.
              </div>
            </div>
            <div v-if="currentTime > 0" class="org-settings-content-header-actions">
              <div :class="{ expired: countdown <= 0 }" class="date-countdown">
                <div class="date-countdown-item">
                  <span class="date-countdown-item-value">{{ dateLeft }}</span>
                  <span class="date-countdown-item-label">Day</span>
                </div>
                <div class="date-countdown-item">
                  <span class="date-countdown-item-value">{{ hourLeft }}</span>
                  <span class="date-countdown-item-label">Hour</span>
                </div>
                <div class="date-countdown-item">
                  <span class="date-countdown-item-value">{{ minuteLeft }}</span>
                  <span class="date-countdown-item-label">Min</span>
                </div>
                <div class="date-countdown-item">
                  <span class="date-countdown-item-value">{{ secondLeft }}</span>
                  <span class="date-countdown-item-label">Sec</span>
                </div>
              </div>
            </div>
          </div>
          <div class="org-settings-content-body">
            <div class="plan-and-billing">
              <div class="plan-and-billing-header">
                <div class="plan-and-billing-header-title">
                  A plan for every product
                </div>
                <div class="plan-and-billing-header-actions">
                  <a href="#">View plan details</a>
                </div>
              </div>
              <div class="plan-and-billing-body">
                <PlanTypeItem
                  v-for="planType in planTypes"
                  :key="planType"
                  :active="isActivePlan(planType)"
                  :planType="planType"
                  @buyNow="onBuyNow"
                  @contactUs="onContactUs"
                ></PlanTypeItem>
              </div>
            </div>
          </div>
        </div>
      </vuescroll>
      <ModifyPlan ref="modify" @buyNow="onRevisePlan" @contactUs="onContactUs"></ModifyPlan>
    </div>
  </LayoutContent>
</template>
<script lang="ts">
import { Component, Ref, Vue } from 'vue-property-decorator';
import { VerticalScrollConfigs } from '@/shared';
import { Inject } from 'typescript-ioc';
import { OrganizationService, PlanDetail } from '@core/organization';
import PlanDetailComponent from '../../components/plan-detail/PlanDetailComponent.vue';
import DiLoading from '@/shared/components/DiLoading.vue';
import { Log } from '@core/utils';
import ModifyPlan from '@/screens/organization-settings/components/modify-plan/ModifyPlan.vue';
import { PlanType } from '@core/organization/domain/plan/PlanType';
import PlanTypeItem from '@/screens/organization-settings/components/PlanTypeItem.vue';
import Swal from 'sweetalert2';
import { LayoutContent, LayoutHeader } from '@/shared/components/layout-wrapper';

@Component({
  components: { PlanDetailComponent, DiLoading, ModifyPlan, PlanTypeItem, LayoutContent, LayoutHeader }
})
export default class PlanAndBilling extends Vue {
  private planDetailUrl = 'https://datainsider.co';
  private data: PlanDetail | null = null;
  private error: string | null = null;
  private inited = false;
  private loading = false;
  private planTypes: PlanType[] = [PlanType.Starter, PlanType.Professional, PlanType.Enterprise, PlanType.OnPremise];
  private currentTime = 0;
  private countdownInterval: number | undefined = undefined;
  private $alert: typeof Swal = Swal;
  private readonly scrollOptions = VerticalScrollConfigs;

  @Inject
  private readonly orgService!: OrganizationService;

  @Ref()
  private readonly modify?: ModifyPlan;

  private get countdown() {
    if (this.data && this.currentTime > 0 && this.data.endDate > this.currentTime) return this.data.endDate - this.currentTime;
    return 0;
  }

  private get dateLeft() {
    if (this.countdown > 0) {
      return Math.floor(this.countdown / 864e5);
    }
    return 0;
  }

  private get hourLeft() {
    if (this.countdown > 0) {
      return Math.floor((this.countdown % 864e5) / 36e5);
    }
    return this.countdown;
  }

  private get minuteLeft() {
    if (this.countdown > 0) {
      return Math.floor(((this.countdown % 864e5) % 36e5) / 6e4);
    }
    return this.countdown;
  }

  private get secondLeft() {
    if (this.countdown > 0) {
      Log.info((((this.countdown % 864e5) % 36e5) % 6e4) / 1000);
      return Math.ceil((((this.countdown % 864e5) % 36e5) % 6e4) / 1000) - 1;
    }
    return this.countdown;
  }

  async mounted() {
    await this.getPlanDetail();
    this.inited = true;
  }

  destroyed() {
    this.stopCountdown();
  }

  private async getPlanDetail() {
    this.loading = true;
    await this.orgService
      .getPlanDetail()
      .then(resp => {
        this.data = resp;
        this.verifyPayment(resp);
        this.startCountdown();
      })
      .catch(e => {
        this.data = null;
        this.error = e.message;
      });
    this.loading = false;
  }

  private verifyPayment(planDetail: PlanDetail) {
    if (planDetail && planDetail.payPalApprovalUrl) {
      this.$alert
        .fire({
          title: 'Your payment was not successful!',
          html: `<div>Please try again to complete payment.<br>Skip this message if you are already paid.</div>`,
          // html: `<p>Please <a href="${this.data.payPalApprovalUrl}" target="_blank">click here</a> to complete your payment!</p>`,
          confirmButtonText: 'Try again',
          showCancelButton: true,
          // showConfirmButton: false,
          cancelButtonText: 'Skip'
        })
        .then(result => {
          if (result.isConfirmed) {
            window.open(planDetail.payPalApprovalUrl);
          }
        });
    }
  }

  private startCountdown() {
    this.countdownInterval = setTimeout(() => {
      if (!this.data) this.stopCountdown();
      this.currentTime = new Date().valueOf();
      if (this.data && this.currentTime < this.data.endDate) {
        this.startCountdown();
      } else {
        this.stopCountdown();
      }
    }, 1000);
  }

  private stopCountdown() {
    if (this.countdownInterval !== null) {
      clearTimeout(this.countdownInterval);
    }
  }

  private isActivePlan(planType: PlanType) {
    return this.data?.planType === planType;
  }

  private async onCancelPlan() {
    if (!this.data) return;
    const { isConfirmed } = await this.$alert.fire({
      icon: 'warning',
      title: 'Cancel Plan',
      html: `Are you sure you want to <br>cancel your <strong>${this.data.planType} plan</strong>?`,
      confirmButtonText: 'Yes',
      showCancelButton: true,
      cancelButtonText: 'No'
    });
    if (isConfirmed) {
      this.$alert.fire({
        icon: 'info',
        title: 'Cancel Plan',
        html: 'Wait a minute...',
        showConfirmButton: false,
        didOpen: () => {
          this.$alert.showLoading();
        }
      });
      this.orgService
        .unsubscribePlan()
        .then(resp => {
          if (resp.success) {
            this.$alert.hideLoading();
            this.$alert.fire({
              icon: 'success',
              title: 'Cancel plan success',
              confirmButtonText: 'OK',
              timer: 2000
            });
            this.getPlanDetail();
          }
        })
        .catch(e => {
          Log.info(e);
          this.$alert.hideLoading();
          this.$alert.fire({
            icon: 'error',
            title: 'Cancel plan fail',
            html: e.message,
            confirmButtonText: 'OK'
          });
        });
    }
  }

  private onModifyPlan() {
    if (this.data) {
      this.modify?.show(this.data);
    }
  }

  private async onContactUs() {
    this.$alert.fire({
      icon: 'info',
      title: 'Contact us',
      html: 'Thank you for your selection.<br>We will contact you soon!',
      confirmButtonText: 'OK'
    });
  }

  private async onBuyNow(planType: PlanType) {
    // if (this.data && this.data.payPalApprovalUrl) {
    //   this.verifyPayment(this.data);
    // } else {
    this.$alert.fire({
      icon: 'info',
      title: 'Subscribe plan',
      html: 'Wait a minute...',
      showConfirmButton: false,
      didOpen: () => {
        this.$alert.showLoading();
      }
    });
    try {
      const resp = await this.orgService.subscribePlan(planType);
      Log.info(resp);
      this.$alert.hideLoading();
      this.$alert.fire({
        icon: 'success',
        title: 'Subscribe plan success',
        html: '<div>Please complete your payment to finished setup.</div>',
        confirmButtonText: 'OK'
        // timer: 2000
      });
      if (resp.approvalLink) {
        window.open(resp.approvalLink);
      }
    } catch (e) {
      Log.info(e);
      this.$alert.hideLoading();
      this.$alert.fire({
        icon: 'error',
        title: 'Subscribe plan fail',
        html: e.message,
        confirmButtonText: 'OK'
      });
    }
    // }
  }

  private async onRevisePlan(planType: PlanType) {
    this.$alert.fire({
      icon: 'info',
      title: 'Modify plan',
      html: 'Wait a minute...',
      showConfirmButton: false,
      didOpen: () => {
        this.$alert.showLoading();
      }
    });
    try {
      const resp = await this.orgService.revisePlan(planType);
      Log.info(resp);
      this.$alert.hideLoading();
      this.$alert.fire({
        icon: 'success',
        title: 'Subscribe plan success',
        confirmButtonText: 'OK',
        timer: 2000
      });
    } catch (e) {
      Log.info(e);
      this.$alert.hideLoading();
      this.$alert.fire({
        icon: 'error',
        title: 'Subscribe plan fail',
        html: e.message,
        confirmButtonText: 'OK'
      });
    }
    // this.orgService
    //   .revisePlan(planType)
    //   .then(resp => {
    //     Log.info(resp);
    //     this.$alert.hideLoading();
    //     this.$alert.fire({
    //       icon: 'success',
    //       title: 'Modify plan success',
    //       confirmButtonText: 'OK',
    //       timer: 2000
    //     });
    //   })
    //   .catch(e => {
    //     Log.info(e);
    //     debugger;
    //     this.$alert.hideLoading();
    //     this.$alert.fire({
    //       icon: 'error',
    //       title: 'Modify plan fail',
    //       html: e.message,
    //       confirmButtonText: 'OK'
    //     });
    //   });
    // this.$alert.fire({
    //   icon: 'info',
    //   title: 'Contact us',
    //   confirmButtonText: 'OK'
    // });
  }
}
</script>
<style lang="scss" src="./PlanAndBilling.scss"></style>
