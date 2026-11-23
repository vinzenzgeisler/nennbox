import type { RegistrationModel } from './RegistrationModel.js';
import {
  completeRegistrationPayment,
  type RegistrationSubmissionResult,
} from './completeRegistrationPayment.js';

export function createPaymentActions(
  model: RegistrationModel,
  organizationId: string,
) {
  function startPayment(result: RegistrationSubmissionResult) {
    return completeRegistrationPayment({
      result,
      paymentChoice: model.paymentChoice,
      organizationId,
      paymentMethods:
        model.payload!.registrationFormConfig.payments.onlineMethods,
      setPaymentInstructions: model.setPaymentInstructions,
      setSubmitted: model.setSubmitted,
      setPaymentError: model.setPaymentError,
    });
  }
  async function retryPayment() {
    if (!model.submissionResult || model.submitting) return;
    model.setSubmitting(true);
    try {
      await startPayment(model.submissionResult);
    } finally {
      model.setSubmitting(false);
    }
  }
  return { startPayment, retryPayment };
}
