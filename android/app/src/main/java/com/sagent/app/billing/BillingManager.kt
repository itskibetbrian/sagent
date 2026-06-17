package com.sagent.app.billing

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClient.BillingResponseCode
import com.android.billingclient.api.BillingClient.ProductType
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryProductDetailsResult
import com.android.billingclient.api.QueryPurchasesParams
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume

data class PurchaseInfo(val purchaseToken: String, val productId: String, val isAcknowledged: Boolean)

sealed class BillingState {
    data object Initializing : BillingState()
    data object Ready : BillingState()
    data object Purchasing : BillingState()
    data class Subscribed(val purchases: List<PurchaseInfo> = emptyList()) : BillingState()
    data class Error(val message: String, val code: Int) : BillingState()
}

class BillingManager(
    context: Context,
    private val scope: CoroutineScope,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : PurchasesUpdatedListener {

    private val appContext = context.applicationContext
    private val managerScope = CoroutineScope(
        scope.coroutineContext + SupervisorJob(scope.coroutineContext[Job])
    )

    private val _billingState = MutableStateFlow<BillingState>(BillingState.Initializing)
    val billingState: StateFlow<BillingState> = _billingState.asStateFlow()

    private val billingClient: BillingClient = BillingClient.newBuilder(appContext)
        .setListener(this)
        .enableAutoServiceReconnection()
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder()
                .enableOneTimeProducts()
                .build()
        )
        .build()

    init {
        scope.coroutineContext[Job]?.invokeOnCompletion {
            endConnection()
            managerScope.coroutineContext[Job]?.cancel()
        }
    }

    suspend fun startConnection(): Result<Unit> = withContext(ioDispatcher) {
        if (billingClient.isReady) {
            if (_billingState.value !is BillingState.Subscribed) {
                _billingState.value = BillingState.Ready
            }
            syncPurchases()
            return@withContext Result.success(Unit)
        }

        _billingState.value = BillingState.Initializing
        val deferred = CompletableDeferred<Result<Unit>>()

        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(billingResult: BillingResult) {
                if (billingResult.responseCode == BillingResponseCode.OK) {
                    _billingState.value = BillingState.Ready
                    deferred.complete(Result.success(Unit))
                    managerScope.launch {
                        syncPurchases()
                    }
                } else {
                    val message = billingResult.debugMessage.ifBlank {
                        "Billing setup failed."
                    }
                    _billingState.value = BillingState.Error(message, billingResult.responseCode)
                    deferred.complete(
                        Result.failure(BillingException(message, billingResult.responseCode))
                    )
                }
            }

            override fun onBillingServiceDisconnected() {
                if (!deferred.isCompleted) {
                    val message = "Google Play Billing disconnected before setup completed."
                    _billingState.value = BillingState.Error(
                        message,
                        BillingResponseCode.SERVICE_DISCONNECTED
                    )
                    deferred.complete(
                        Result.failure(
                            BillingException(message, BillingResponseCode.SERVICE_DISCONNECTED)
                        )
                    )
                } else if (_billingState.value !is BillingState.Subscribed) {
                    _billingState.value = BillingState.Initializing
                }
            }
        })

        deferred.await()
    }

    suspend fun fetchSubscriptions(productIds: List<String>): Result<List<ProductDetails>> =
        withContext(ioDispatcher) {
            if (productIds.isEmpty()) return@withContext Result.success(emptyList())

            val connectionResult = ensureConnected()
            if (connectionResult.isFailure) {
                return@withContext Result.failure(connectionResult.exceptionOrNull()!!)
            }

            suspendCancellableCoroutine { continuation ->
                val params = QueryProductDetailsParams.newBuilder()
                    .setProductList(
                        productIds.distinct().map { productId ->
                            QueryProductDetailsParams.Product.newBuilder()
                                .setProductId(productId)
                                .setProductType(ProductType.SUBS)
                                .build()
                        }
                    )
                    .build()

                billingClient.queryProductDetailsAsync(params) { billingResult, queryResult: QueryProductDetailsResult ->
                    if (billingResult.responseCode != BillingResponseCode.OK) {
                        val message = billingResult.debugMessage.ifBlank {
                            "Unable to query subscription products."
                        }
                        _billingState.value =
                            BillingState.Error(message, billingResult.responseCode)
                        continuation.resume(
                            Result.failure(
                                BillingException(message, billingResult.responseCode)
                            )
                        )
                        return@queryProductDetailsAsync
                    }

                    val productDetails = queryResult.productDetailsList
                    val unfetched = queryResult.unfetchedProductList

                    if (productDetails.isNotEmpty()) {
                        if (_billingState.value !is BillingState.Subscribed) {
                            _billingState.value = BillingState.Ready
                        }
                        continuation.resume(Result.success(productDetails))
                        return@queryProductDetailsAsync
                    }

                    if (unfetched.isNotEmpty()) {
                        val first = unfetched.first()
                        val message = buildString {
                            append("No subscription details were fetched. ")
                            append(
                                unfetched.joinToString(separator = "; ") {
                                    "${it.productId} status=${it.statusCode}"
                                }
                            )
                        }
                        _billingState.value = BillingState.Error(message, first.statusCode)
                        continuation.resume(
                            Result.failure(BillingException(message, first.statusCode))
                        )
                        return@queryProductDetailsAsync
                    }

                    val message = "No subscription details returned."
                    _billingState.value =
                        BillingState.Error(message, BillingResponseCode.ITEM_UNAVAILABLE)
                    continuation.resume(
                        Result.failure(
                            BillingException(message, BillingResponseCode.ITEM_UNAVAILABLE)
                        )
                    )
                }
            }
        }

    fun launchPurchase(
        activity: Activity,
        productDetails: ProductDetails,
        offerToken: String,
    ): Result<Unit> {
        if (!billingClient.isReady) {
            val message = "Billing client is not connected."
            _billingState.value =
                BillingState.Error(message, BillingResponseCode.SERVICE_DISCONNECTED)
            return Result.failure(
                BillingException(message, BillingResponseCode.SERVICE_DISCONNECTED)
            )
        }

        val productParams = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(productDetails)
            .setOfferToken(offerToken)
            .build()

        val flowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(productParams))
            .build()

        _billingState.value = BillingState.Purchasing
        val billingResult = billingClient.launchBillingFlow(activity, flowParams)

        return when (billingResult.responseCode) {
            BillingResponseCode.OK -> Result.success(Unit)
            BillingResponseCode.USER_CANCELED -> {
                if (_billingState.value !is BillingState.Subscribed) {
                    _billingState.value = BillingState.Ready
                }
                Result.success(Unit)
            }

            else -> {
                val message = billingResult.debugMessage.ifBlank {
                    "Unable to launch purchase flow."
                }
                _billingState.value = BillingState.Error(message, billingResult.responseCode)
                Result.failure(BillingException(message, billingResult.responseCode))
            }
        }
    }

    override fun onPurchasesUpdated(
        billingResult: BillingResult,
        purchases: MutableList<Purchase>?,
    ) {
        when (billingResult.responseCode) {
            BillingResponseCode.OK -> {
                if (purchases.isNullOrEmpty()) {
                    if (_billingState.value !is BillingState.Subscribed) {
                        _billingState.value = BillingState.Ready
                    }
                    return
                }

                managerScope.launch {
                    processPurchases(purchases)
                }
            }

            BillingResponseCode.USER_CANCELED -> {
                if (_billingState.value !is BillingState.Subscribed) {
                    _billingState.value = BillingState.Ready
                }
            }

            else -> {
                val message = billingResult.debugMessage.ifBlank {
                    "Purchase failed."
                }
                _billingState.value = BillingState.Error(message, billingResult.responseCode)
            }
        }
    }

    private suspend fun processPurchases(purchases: List<Purchase>) {
        val purchasedItems = purchases.filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }

        if (purchasedItems.isEmpty()) {
            if (_billingState.value !is BillingState.Subscribed) {
                _billingState.value = BillingState.Ready
            }
            return
        }

        val purchaseInfoList = purchasedItems.map { purchase ->
            PurchaseInfo(
                purchaseToken = purchase.purchaseToken,
                productId = purchase.products.firstOrNull() ?: "",
                isAcknowledged = purchase.isAcknowledged
            )
        }

        _billingState.value = BillingState.Subscribed(purchaseInfoList)
    }

    suspend fun acknowledgePurchase(purchaseToken: String): Result<Unit> =
        withContext(ioDispatcher) {
            suspendCancellableCoroutine { continuation ->
                val params = AcknowledgePurchaseParams.newBuilder()
                    .setPurchaseToken(purchaseToken)
                    .build()

                billingClient.acknowledgePurchase(params) { billingResult ->
                    if (billingResult.responseCode == BillingResponseCode.OK) {
                        continuation.resume(Result.success(Unit))
                    } else {
                        val message = billingResult.debugMessage.ifBlank {
                            "Google Play did not acknowledge the purchase."
                        }
                        continuation.resume(
                            Result.failure(
                                BillingException(message, billingResult.responseCode)
                            )
                        )
                    }
                }
            }
        }

    private suspend fun syncPurchases() {
        val result = queryActiveSubscriptions()
        if (result.isFailure) {
            val error = result.exceptionOrNull() as? BillingException
            _billingState.value = BillingState.Error(
                message = error?.message ?: "Unable to query purchases.",
                code = error?.code ?: BillingResponseCode.ERROR
            )
            return
        }

        val purchases = result.getOrDefault(emptyList())
        if (purchases.isEmpty()) {
            if (_billingState.value !is BillingState.Subscribed) {
                _billingState.value = BillingState.Ready
            }
            return
        }

        processPurchases(purchases)
    }

    private suspend fun queryActiveSubscriptions(): Result<List<Purchase>> =
        withContext(ioDispatcher) {
            val connectionResult = ensureConnected()
            if (connectionResult.isFailure) {
                return@withContext Result.failure(connectionResult.exceptionOrNull()!!)
            }

            suspendCancellableCoroutine { continuation ->
                val params = QueryPurchasesParams.newBuilder()
                    .setProductType(ProductType.SUBS)
                    .build()

                billingClient.queryPurchasesAsync(params) { billingResult, purchases ->
                    if (billingResult.responseCode == BillingResponseCode.OK) {
                        continuation.resume(Result.success(purchases))
                    } else {
                        val message = billingResult.debugMessage.ifBlank {
                            "Unable to query active subscriptions."
                        }
                        continuation.resume(
                            Result.failure(
                                BillingException(message, billingResult.responseCode)
                            )
                        )
                    }
                }
            }
        }

    private suspend fun ensureConnected(): Result<Unit> {
        return if (billingClient.isReady) {
            Result.success(Unit)
        } else {
            startConnection()
        }
    }

    private fun endConnection() {
        if (billingClient.isReady) {
            billingClient.endConnection()
        }
    }

    private class BillingException(
        override val message: String,
        val code: Int,
    ) : IllegalStateException(message)
}
