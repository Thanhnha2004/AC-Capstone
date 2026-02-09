// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

interface IPrincipalVault {
    function depositPrincipal(address from, uint256 amount) external;
    function receiveDirectDeposit(address user, uint256 amount) external;
    function withdrawPrincipal(address to, uint256 amount) external;
    function getBalance() external view returns (uint256);
}

interface IInterestVault {
    function payInterest(address user, uint256 amount) external;
    function transferInterestToPrincipal(
        address principalVault,
        address user,
        uint256 amount
    ) external;
    function getBalance() external view returns (uint256);
}

interface ISavingBankNFT {
    function mint(
        address to,
        uint256 tokenId,
        uint256 planId,
        uint256 depositAmount
    ) external;
    function burn(uint256 tokenId) external;
    function ownerOf(uint256 tokenId) external view returns (address);
}

/**
 * @title SavingBankV3
 * @notice Saving Bank với Access Control và 2 vault riêng biệt
 * @dev Không giữ tiền, tất cả tiền được giữ ở PrincipalVault và InterestVault
 */
contract SavingBankUpgradeable is
    Initializable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/
    error InvalidToken();
    error InvalidVault();
    error InvalidNFT();
    error NotEnabledPlan();
    error InvalidAmount();
    error InvalidAddress();
    error InvalidTenor();
    error InvalidAPR();
    error InvalidMinDeposit();
    error InvalidMaxDeposit();
    error NotExceed();
    error InvalidPlanId();
    error NotOwner();
    error NotActiveDeposit();
    error NotMaturedYet();
    error AlreadyMatured();
    error AlreadyRenewed();
    error OnlyTimelockOrAdmin();
    error InvalidTimelock();
    error AutoCompoundAlreadyEnabled();
    error AutoCompoundNotEnabled();
    error CompoundTooEarly();
    error DepositAlreadyMatured();
    error NoInterestToCompound();
    error InsufficientBalance();
    error BelowMinimumRemaining();
    error SamePlan();
    error MigrationFeeExceedsMax();
    error InvalidMigrationFee();

    /*//////////////////////////////////////////////////////////////
                              CONSTANTS
    //////////////////////////////////////////////////////////////*/
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    uint256 private constant SECONDS_PER_YEAR = 365 days;
    uint256 private constant BASIS_POINTS = 10000;

    uint256 private constant MAX_MIGRATION_FEE_BPS = 500;

    /*//////////////////////////////////////////////////////////////
                                ENUMS
    //////////////////////////////////////////////////////////////*/
    enum DepositStatus {
        Active,
        Withdrawn,
        EarlyWithdrawn,
        Renewed
    }

    /*//////////////////////////////////////////////////////////////
                               STRUCTS
    //////////////////////////////////////////////////////////////*/
    struct SavingPlan {
        uint256 tenorDays;
        uint256 aprBps;
        uint256 minDeposit;
        uint256 maxDeposit;
        uint256 earlyWithdrawPenaltyBps;
        bool enabled;
    }

    struct DepositCertificate {
        address owner;
        uint256 planId;
        uint256 principal;
        uint256 startAt;
        uint256 maturityAt;
        DepositStatus status;
        uint256 renewedDepositId;
        uint256 snapshotAprBps;
        uint256 snapshotTenorDays;
        uint256 snapshotEarlyWithdrawPenaltyBps;
        bool autoCompound;
        uint256 lastCompoundTime;
        uint256 accumulatedInterest;
        uint256 totalPartialWithdrawn;
    }

    struct PartialWithdrawal {
        uint256 amount;
        uint256 timestamp;
        uint256 penaltyAmount;
    }

    /*//////////////////////////////////////////////////////////////
                           STATE VARIABLES
    //////////////////////////////////////////////////////////////*/
    IERC20 public token;
    ISavingBankNFT public nft;

    uint256 public nextPlanId;
    uint256 public nextDepositId;

    mapping(uint256 => SavingPlan) public savingPlans;
    mapping(uint256 => DepositCertificate) public depositCertificates;
    mapping(address => uint256[]) public userDepositIds;

    IPrincipalVault public principalVault;
    IInterestVault public interestVault;
    address public feeReceiver;
    address public timelock;

    mapping(uint256 => PartialWithdrawal[]) public partialWithdrawHistory;

    uint256 public migrationFeeBps; // Migration fee in basis points (default 50 = 0.5%)

    /*//////////////////////////////////////////////////////////////
                            INITIALIZER
    //////////////////////////////////////////////////////////////*/

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _token,
        address _principalVault,
        address _interestVault,
        address _nft,
        address _feeReceiver,
        address _admin,
        address _operator,
        address _timelock
    ) public initializer {
        // Validation (giữ nguyên như constructor cũ)
        if (_token == address(0)) revert InvalidToken();
        if (_principalVault == address(0)) revert InvalidVault();
        if (_interestVault == address(0)) revert InvalidVault();
        if (_nft == address(0)) revert InvalidNFT();
        if (_feeReceiver == address(0)) revert InvalidAddress();
        if (_admin == address(0)) revert InvalidAddress();
        if (_operator == address(0)) revert InvalidAddress();
        if (_timelock == address(0)) revert InvalidTimelock();

        // Initialize parent contracts
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        // Initialize state variables (giống constructor cũ)
        token = IERC20(_token);
        principalVault = IPrincipalVault(_principalVault);
        interestVault = IInterestVault(_interestVault);
        nft = ISavingBankNFT(_nft);
        feeReceiver = _feeReceiver;
        timelock = _timelock;

        nextPlanId = 1;
        nextDepositId = 1;
        migrationFeeBps = 50;

        // Grant roles
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _operator);
    }

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/
    event PlanCreated(
        uint256 indexed planId,
        uint256 tenorDays,
        uint256 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 earlyWithdrawPenaltyBps
    );
    event FeeReceiverUpdated(address indexed newFeeReceiver);
    event PlanUpdated(uint256 indexed planId, bool isEnabled);
    event VaultUpdated(
        address indexed newPrincipalVault,
        address indexed newInterestVault
    );
    event NFTUpdated(address indexed newNFT);
    event DepositCertificateOpened(
        uint256 indexed depositId,
        address indexed user,
        uint256 indexed planId,
        uint256 depositAmount,
        uint256 maturityTimestamp
    );
    event Withdrawn(
        uint256 indexed depositId,
        address indexed user,
        uint256 principalAmount,
        uint256 interestAmount,
        DepositStatus finalStatus
    );
    event EarlyWithdrawn(
        uint256 indexed depositId,
        address indexed user,
        uint256 amountReceived,
        uint256 penaltyAmount,
        DepositStatus finalStatus
    );
    event Renewed(
        uint256 indexed oldDepositId,
        uint256 indexed newDepositId,
        uint256 newPrincipal
    );
    event TimelockUpdated(address indexed newTimelock);
    event InterestCalculated(
        uint256 indexed depositId,
        uint256 principal,
        uint256 interest,
        uint256 timestamp
    );
    event PenaltyApplied(
        uint256 indexed depositId,
        address indexed user,
        uint256 penaltyAmount,
        uint256 penaltyRate,
        uint256 timestamp
    );
    event PlanParametersUpdated(
        uint256 indexed planId,
        uint256 oldAPR,
        uint256 newAPR,
        uint256 oldTenor,
        uint256 newTenor,
        address indexed updatedBy
    );
    event EmergencyWithdraw(
        uint256 indexed depositId,
        address indexed user,
        uint256 amount,
        string reason
    );
    event VaultBalanceChanged(
        address indexed vault,
        uint256 oldBalance,
        uint256 newBalance,
        string operation
    );
    event AutoCompoundEnabled(uint256 indexed depositId, address indexed user);
    event AutoCompoundDisabled(uint256 indexed depositId, address indexed user);
    event Compounded(
        uint256 indexed depositId,
        uint256 interestAdded,
        uint256 newPrincipal
    );
    event CompoundedBatch(uint256[] depositIds, uint256 totalCompounded);
    event CompoundFailed(uint256 depositId);
    event PartialWithdrawn(
        uint256 indexed depositId,
        address indexed user,
        uint256 amount,
        uint256 penalty,
        uint256 amountToUser
    );
    event PartialWithdrawalPenaltyCalculated(
        uint256 indexed depositId,
        uint256 amount,
        uint256 timeRemaining,
        uint256 penalty
    );
    event MinimumRemainingViolation(
        uint256 indexed depositId,
        uint256 attemptedAmount,
        uint256 minimumRequired
    );
    event PlanMigrated(
        uint256 indexed oldDepositId,
        uint256 indexed newDepositId,
        uint256 indexed oldPlanId,
        uint256 newPlanId,
        uint256 accruedInterest,
        uint256 migrationFee,
        uint256 newPrincipal
    );
    event MigrationFeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);

    /*//////////////////////////////////////////////////////////////
                          MODIFIERS
    //////////////////////////////////////////////////////////////*/

    modifier onlyTimelockOrAdmin() {
        if (msg.sender != timelock && !hasRole(ADMIN_ROLE, msg.sender)) {
            revert OnlyTimelockOrAdmin();
        }
        _;
    }

    /*//////////////////////////////////////////////////////////////
                          CORE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Open a new deposit certificate
     */
    function openDepositCertificate(
        uint256 planId,
        uint256 depositAmount
    ) external whenNotPaused nonReentrant {
        SavingPlan memory plan = savingPlans[planId];

        if (!plan.enabled) revert NotEnabledPlan();
        if (depositAmount < plan.minDeposit) revert InvalidAmount();
        if (plan.maxDeposit > 0 && depositAmount > plan.maxDeposit)
            revert InvalidAmount();

        address depositor = msg.sender;
        uint256 newDepositId = nextDepositId;
        uint256 maturityTimestamp = block.timestamp + (plan.tenorDays * 1 days);

        depositCertificates[newDepositId] = DepositCertificate({
            owner: depositor,
            planId: planId,
            principal: depositAmount,
            startAt: block.timestamp,
            maturityAt: maturityTimestamp,
            status: DepositStatus.Active,
            renewedDepositId: 0,
            snapshotAprBps: plan.aprBps,
            snapshotTenorDays: plan.tenorDays,
            snapshotEarlyWithdrawPenaltyBps: plan.earlyWithdrawPenaltyBps,
            autoCompound: false, // ← FIX: Default to FALSE (user opt-in)
            lastCompoundTime: block.timestamp,
            accumulatedInterest: 0,
            totalPartialWithdrawn: 0
        });

        userDepositIds[depositor].push(newDepositId);
        nextDepositId++;

        principalVault.depositPrincipal(depositor, depositAmount);
        nft.mint(depositor, newDepositId, planId, depositAmount);

        emit DepositCertificateOpened(
            newDepositId,
            depositor,
            planId,
            depositAmount,
            maturityTimestamp
        );
    }

    /**
     * @notice Withdraw at maturity
     */
    function withdraw(uint256 depositId) external whenNotPaused nonReentrant {
        DepositCertificate storage deposit = depositCertificates[depositId];

        if (deposit.owner != msg.sender) revert NotOwner();
        if (deposit.status != DepositStatus.Active) revert NotActiveDeposit();
        if (block.timestamp < deposit.maturityAt) revert NotMaturedYet();

        uint256 totalInterest;
        uint256 currentPrincipal = deposit.principal -
            deposit.totalPartialWithdrawn;

        // ================================================================
        // STEP 1: Handle Auto-Compound (if enabled)
        // ================================================================

        if (deposit.autoCompound) {
            // Do final compound from lastCompoundTime to maturity
            uint256 timePassed = deposit.maturityAt - deposit.lastCompoundTime;
            if (timePassed > 0) {
                // Calculate interest on CURRENT principal (after partial withdrawals)
                uint256 finalInterest = (currentPrincipal *
                    deposit.snapshotAprBps *
                    timePassed) / (SECONDS_PER_YEAR * BASIS_POINTS);

                if (finalInterest > 0) {
                    // Transfer interest to PrincipalVault
                    interestVault.transferInterestToPrincipal(
                        address(principalVault),
                        deposit.owner,
                        finalInterest
                    );
                    principalVault.receiveDirectDeposit(
                        deposit.owner,
                        finalInterest
                    );

                    deposit.principal += finalInterest;
                    deposit.accumulatedInterest += finalInterest;

                    // ✅ Update current principal for withdrawal
                    currentPrincipal += finalInterest;
                }
            }

            totalInterest = 0;
        }
        // ================================================================
        // STEP 2: Handle Disabled Compound (had compound, then disabled)
        // ================================================================
        else if (deposit.accumulatedInterest > 0) {
            // Calculate remaining interest from disable time to maturity
            // on CURRENT principal
            uint256 timePassed = deposit.maturityAt - deposit.lastCompoundTime;
            uint256 remainingInterest = (currentPrincipal *
                deposit.snapshotAprBps *
                timePassed) / (SECONDS_PER_YEAR * BASIS_POINTS);

            // Total interest = accumulated (already in principal) + remaining
            totalInterest = deposit.accumulatedInterest + remainingInterest;
        }
        // ================================================================
        // STEP 3: Normal Interest (no compound at all)
        // ================================================================
        else {
            // Calculate interest on CURRENT principal (after partial withdrawals)
            totalInterest = _calculateInterestOnRemaining(depositId);
        }

        // ================================================================
        // STEP 4: Update Status
        // ================================================================

        deposit.status = DepositStatus.Withdrawn;

        // ================================================================
        // STEP 5: Withdraw Funds
        // ================================================================

        // Withdraw principal (includes accumulated interest if compounded)
        if (currentPrincipal > 0) {
            principalVault.withdrawPrincipal(msg.sender, currentPrincipal);
        }

        // Pay additional interest from InterestVault
        if (totalInterest > 0) {
            interestVault.payInterest(msg.sender, totalInterest);
        }

        // Burn NFT
        nft.burn(depositId);

        emit Withdrawn(
            depositId,
            msg.sender,
            currentPrincipal,
            totalInterest,
            DepositStatus.Withdrawn
        );
    }

    /**
     * @notice Early withdraw with penalty
     * @dev User loses ALL interest, only gets remaining principal - penalty
     */
    function earlyWithdraw(uint256 depositId) external nonReentrant {
        DepositCertificate storage deposit = depositCertificates[depositId];

        if (deposit.owner != msg.sender) revert NotOwner();
        if (deposit.status != DepositStatus.Active) revert NotActiveDeposit();
        if (block.timestamp >= deposit.maturityAt) revert AlreadyMatured();

        // ================================================================
        // Calculate remaining principal after partial withdrawals
        // NO interest calculation needed - user loses all interest!
        // ================================================================
        uint256 remainingPrincipal = deposit.principal -
            deposit.totalPartialWithdrawn;

        // ================================================================
        // Calculate penalty on REMAINING principal only
        // ================================================================
        uint256 penalty = (remainingPrincipal *
            deposit.snapshotEarlyWithdrawPenaltyBps) / BASIS_POINTS;

        uint256 amountToUser = remainingPrincipal - penalty;

        emit PenaltyApplied(
            depositId,
            msg.sender,
            penalty,
            deposit.snapshotEarlyWithdrawPenaltyBps,
            block.timestamp
        );

        deposit.status = DepositStatus.EarlyWithdrawn;

        // ================================================================
        // Transfer funds
        // ================================================================

        // User receives: remaining principal - penalty (NO interest)
        principalVault.withdrawPrincipal(msg.sender, amountToUser);

        // Fee receiver gets penalty
        if (penalty > 0) {
            principalVault.withdrawPrincipal(feeReceiver, penalty);
        }

        // Burn NFT
        nft.burn(depositId);

        emit EarlyWithdrawn(
            depositId,
            msg.sender,
            amountToUser,
            penalty,
            DepositStatus.EarlyWithdrawn
        );
    }

    /**
     * @notice Renew deposit at maturity to a new plan
     * @dev Now handles auto-compound + partial withdrawals correctly
     */
    function renew(uint256 depositId, uint256 newPlanId) external nonReentrant {
        DepositCertificate storage oldDeposit = depositCertificates[depositId];

        if (oldDeposit.owner != msg.sender) revert NotOwner();
        if (block.timestamp < oldDeposit.maturityAt) revert NotMaturedYet();
        if (oldDeposit.renewedDepositId != 0) revert AlreadyRenewed();
        if (oldDeposit.status != DepositStatus.Active)
            revert NotActiveDeposit();

        SavingPlan memory plan = savingPlans[newPlanId];
        if (!plan.enabled) revert NotEnabledPlan();

        // ================================================================
        // Calculate REMAINING principal (after partial withdrawals)
        // ================================================================
        uint256 currentPrincipal = oldDeposit.principal -
            oldDeposit.totalPartialWithdrawn;
        uint256 totalInterest;

        // ================================================================
        // Handle Auto-Compound (same logic as withdraw)
        // ================================================================
        if (oldDeposit.autoCompound) {
            // Do final compound
            uint256 timePassed = oldDeposit.maturityAt -
                oldDeposit.lastCompoundTime;
            if (timePassed > 0) {
                uint256 finalInterest = (currentPrincipal *
                    oldDeposit.snapshotAprBps *
                    timePassed) / (SECONDS_PER_YEAR * BASIS_POINTS);

                if (finalInterest > 0) {
                    // Transfer interest to PrincipalVault
                    interestVault.transferInterestToPrincipal(
                        address(principalVault),
                        oldDeposit.owner,
                        finalInterest
                    );
                    principalVault.receiveDirectDeposit(
                        oldDeposit.owner,
                        finalInterest
                    );

                    // Update
                    oldDeposit.principal += finalInterest;
                    oldDeposit.accumulatedInterest += finalInterest;
                    currentPrincipal += finalInterest;
                }
            }

            // Total interest = all accumulated (already in currentPrincipal)
            totalInterest = 0; // No need to transfer separately
        }
        // ================================================================
        // Handle Disabled Compound
        // ================================================================
        else if (oldDeposit.accumulatedInterest > 0) {
            // Calculate remaining interest
            uint256 timePassed = oldDeposit.maturityAt -
                oldDeposit.lastCompoundTime;
            uint256 remainingInterest = (currentPrincipal *
                oldDeposit.snapshotAprBps *
                timePassed) / (SECONDS_PER_YEAR * BASIS_POINTS);

            totalInterest = remainingInterest;
            // accumulated already in currentPrincipal
        }
        // ================================================================
        // No Compound
        // ================================================================
        else {
            totalInterest = _calculateInterestOnRemaining(depositId);
        }

        // ================================================================
        // Calculate new principal
        // ================================================================
        uint256 newPrincipal = currentPrincipal + totalInterest;

        uint256 newId = nextDepositId;
        address user = msg.sender;
        uint256 maturity = block.timestamp + (plan.tenorDays * 1 days);

        oldDeposit.status = DepositStatus.Renewed;
        oldDeposit.renewedDepositId = newId;

        userDepositIds[user].push(newId);
        nextDepositId++;

        // ================================================================
        // Transfer remaining interest (if any)
        // ================================================================
        if (totalInterest > 0) {
            interestVault.transferInterestToPrincipal(
                address(principalVault),
                user,
                totalInterest
            );
            principalVault.receiveDirectDeposit(user, totalInterest);
        }

        // ================================================================
        // Create new deposit (FRESH state)
        // ================================================================
        depositCertificates[newId] = DepositCertificate({
            owner: user,
            planId: newPlanId,
            principal: newPrincipal,
            startAt: block.timestamp,
            maturityAt: maturity,
            status: DepositStatus.Active,
            renewedDepositId: 0,
            snapshotAprBps: plan.aprBps,
            snapshotTenorDays: plan.tenorDays,
            snapshotEarlyWithdrawPenaltyBps: plan.earlyWithdrawPenaltyBps,
            autoCompound: false, // Reset (user can enable)
            lastCompoundTime: block.timestamp,
            accumulatedInterest: 0,
            totalPartialWithdrawn: 0
        });

        nft.burn(depositId);
        nft.mint(user, newId, newPlanId, newPrincipal);

        emit Renewed(depositId, newId, newPrincipal);
        emit DepositCertificateOpened(
            newId,
            user,
            newPlanId,
            newPrincipal,
            maturity
        );
    }

    function enableAutoCompound(uint256 depositId) external {
        DepositCertificate storage deposit = depositCertificates[depositId];

        // Validations
        if (deposit.owner != msg.sender) revert NotOwner();
        if (deposit.status != DepositStatus.Active) revert NotActiveDeposit();
        if (block.timestamp >= deposit.maturityAt)
            revert DepositAlreadyMatured();
        if (deposit.autoCompound) revert AutoCompoundAlreadyEnabled();

        // Enable
        deposit.autoCompound = true;
        deposit.lastCompoundTime = block.timestamp;

        emit AutoCompoundEnabled(depositId, msg.sender);
    }

    /**
     * @notice Disable auto-compound (with final compound)
     * @dev Now compounds on remaining principal after partial withdrawals
     */
    function disableAutoCompound(uint256 depositId) external {
        DepositCertificate storage deposit = depositCertificates[depositId];

        // Validations
        if (deposit.owner != msg.sender) revert NotOwner();
        if (deposit.status != DepositStatus.Active) revert NotActiveDeposit();
        if (block.timestamp >= deposit.maturityAt)
            revert DepositAlreadyMatured();
        if (!deposit.autoCompound) revert AutoCompoundNotEnabled();

        // ================================================================
        // Compound any accumulated interest before disabling
        // Calculate on CURRENT principal (after partial withdrawals)
        // ================================================================
        uint256 currentPrincipal = deposit.principal -
            deposit.totalPartialWithdrawn;
        uint256 timePassed = block.timestamp - deposit.lastCompoundTime;

        if (timePassed > 0) {
            uint256 interest = (currentPrincipal *
                deposit.snapshotAprBps *
                timePassed) / (SECONDS_PER_YEAR * BASIS_POINTS);

            if (interest > 0) {
                // Transfer from InterestVault to PrincipalVault
                interestVault.transferInterestToPrincipal(
                    address(principalVault),
                    deposit.owner,
                    interest
                );
                principalVault.receiveDirectDeposit(deposit.owner, interest);

                deposit.principal += interest;
                deposit.accumulatedInterest += interest;
            }
        }

        // Disable
        deposit.autoCompound = false;
        deposit.lastCompoundTime = block.timestamp;

        emit AutoCompoundDisabled(depositId, msg.sender);
    }

    /**
     * @notice Compound interest
     * @dev Now calculates on remaining principal after partial withdrawals
     */
    function compound(uint256 depositId) public nonReentrant whenNotPaused {
        DepositCertificate storage deposit = depositCertificates[depositId];

        // 1. Validations
        if (!deposit.autoCompound) revert AutoCompoundNotEnabled();
        if (deposit.status != DepositStatus.Active) revert NotActiveDeposit();
        if (block.timestamp >= deposit.maturityAt)
            revert DepositAlreadyMatured();

        // 2. Check minimum time passed (e.g., 7 days)
        uint256 MIN_COMPOUND_INTERVAL = 7 days;
        if (
            block.timestamp < deposit.lastCompoundTime + MIN_COMPOUND_INTERVAL
        ) {
            revert CompoundTooEarly();
        }

        // ================================================================
        // 3. Calculate interest on CURRENT principal (after partial withdrawals)
        // ================================================================
        uint256 currentPrincipal = deposit.principal -
            deposit.totalPartialWithdrawn;
        uint256 timePassed = block.timestamp - deposit.lastCompoundTime;

        uint256 interest = (currentPrincipal *
            deposit.snapshotAprBps *
            timePassed) / (SECONDS_PER_YEAR * BASIS_POINTS);

        if (interest == 0) revert NoInterestToCompound();

        // ================================================================
        // 4. Transfer interest from InterestVault to PrincipalVault
        // ================================================================
        interestVault.transferInterestToPrincipal(
            address(principalVault),
            deposit.owner,
            interest
        );
        principalVault.receiveDirectDeposit(deposit.owner, interest);

        // ================================================================
        // 5. Update certificate
        // ================================================================
        // Important: Update deposit.principal (this adds interest to total)
        // But totalPartialWithdrawn stays the same
        deposit.principal += interest;
        deposit.accumulatedInterest += interest;
        deposit.lastCompoundTime = block.timestamp;

        emit Compounded(depositId, interest, deposit.principal);
    }

    function compoundBatch(uint256[] calldata depositIds) public {
        uint256 successCount = 0;

        for (uint256 i = 0; i < depositIds.length; i++) {
            try this.compound(depositIds[i]) {
                successCount++;
            } catch {
                // Log error but continue
                emit CompoundFailed(depositIds[i]);
            }
        }

        emit CompoundedBatch(depositIds, successCount);
    }

    function partialWithdraw(
        uint256 depositId,
        uint256 amount
    ) external whenNotPaused nonReentrant {
        DepositCertificate storage deposit = depositCertificates[depositId];

        // 1. Validations
        if (deposit.owner != msg.sender) revert NotOwner();
        if (deposit.status != DepositStatus.Active) revert NotActiveDeposit();
        if (block.timestamp >= deposit.maturityAt) revert AlreadyMatured();

        // 2. Check available balance
        uint256 available = deposit.principal - deposit.totalPartialWithdrawn;
        if (amount > available) revert InsufficientBalance();

        // 3. Check minimum remaining
        SavingPlan memory plan = savingPlans[deposit.planId];
        uint256 remaining = available - amount;
        if (remaining < plan.minDeposit && remaining != 0) {
            revert BelowMinimumRemaining();
        }

        // 4. Calculate time-based penalty
        uint256 penalty = _calculatePartialWithdrawPenalty(depositId, amount);
        uint256 amountToUser = amount - penalty;

        // 5. Transfer from PrincipalVault
        principalVault.withdrawPrincipal(msg.sender, amountToUser);
        if (penalty > 0) {
            principalVault.withdrawPrincipal(feeReceiver, penalty);
        }

        // 6. Update state
        deposit.totalPartialWithdrawn += amount;

        // 7. Optional: Record history
        partialWithdrawHistory[depositId].push(
            PartialWithdrawal({
                amount: amount,
                timestamp: block.timestamp,
                penaltyAmount: penalty
            })
        );

        emit PartialWithdrawn(
            depositId,
            msg.sender,
            amount,
            penalty,
            amountToUser
        );
    }

    /**
     * @notice Migrate deposit to a new plan
     * @dev Burns old NFT, creates new deposit with new plan
     * @param depositId Current deposit ID
     * @param newPlanId Plan ID to migrate to
     */
    function migratePlan(
        uint256 depositId,
        uint256 newPlanId
    ) external whenNotPaused nonReentrant {
        DepositCertificate storage oldDeposit = depositCertificates[depositId];

        // ================================================================
        // STEP 1: Validations
        // ================================================================
        if (oldDeposit.owner != msg.sender) revert NotOwner();
        if (oldDeposit.status != DepositStatus.Active)
            revert NotActiveDeposit();
        if (block.timestamp >= oldDeposit.maturityAt) revert AlreadyMatured();
        if (oldDeposit.planId == newPlanId) revert SamePlan();

        SavingPlan memory newPlan = savingPlans[newPlanId];
        if (!newPlan.enabled) revert NotEnabledPlan();

        // ================================================================
        // STEP 2: Calculate accrued interest up to migration point
        // ================================================================
        uint256 currentPrincipal = oldDeposit.principal -
            oldDeposit.totalPartialWithdrawn;
        uint256 accruedInterest;

        // Handle auto-compound case
        if (oldDeposit.autoCompound) {
            uint256 timePassed = block.timestamp - oldDeposit.lastCompoundTime;
            if (timePassed > 0) {
                accruedInterest =
                    (currentPrincipal *
                        oldDeposit.snapshotAprBps *
                        timePassed) /
                    (SECONDS_PER_YEAR * BASIS_POINTS);

                if (accruedInterest > 0) {
                    // Transfer interest to PrincipalVault
                    interestVault.transferInterestToPrincipal(
                        address(principalVault),
                        oldDeposit.owner,
                        accruedInterest
                    );
                    principalVault.receiveDirectDeposit(
                        oldDeposit.owner,
                        accruedInterest
                    );

                    oldDeposit.principal += accruedInterest;
                    oldDeposit.accumulatedInterest += accruedInterest;
                    currentPrincipal += accruedInterest;
                }
            }
        }
        // Handle disabled compound case
        else if (oldDeposit.accumulatedInterest > 0) {
            uint256 timePassed = block.timestamp - oldDeposit.lastCompoundTime;
            accruedInterest =
                (currentPrincipal * oldDeposit.snapshotAprBps * timePassed) /
                (SECONDS_PER_YEAR * BASIS_POINTS);
        }
        // Normal case (no compound)
        else {
            uint256 timePassed = block.timestamp - oldDeposit.startAt;
            accruedInterest =
                (currentPrincipal * oldDeposit.snapshotAprBps * timePassed) /
                (SECONDS_PER_YEAR * BASIS_POINTS);
        }

        // ================================================================
        // STEP 3: Calculate new principal and migration fee
        // ================================================================
        uint256 principalWithInterest = currentPrincipal + accruedInterest;
        uint256 migrationFee = (principalWithInterest * migrationFeeBps) /
            BASIS_POINTS;
        uint256 newPrincipal = principalWithInterest - migrationFee;

        // Check new principal meets minimum deposit of new plan
        if (newPrincipal < newPlan.minDeposit) revert InvalidAmount();
        if (newPlan.maxDeposit > 0 && newPrincipal > newPlan.maxDeposit)
            revert InvalidAmount();

        // ================================================================
        // STEP 4: Transfer accrued interest (if not yet transferred)
        // ================================================================
        if (accruedInterest > 0 && !oldDeposit.autoCompound) {
            interestVault.transferInterestToPrincipal(
                address(principalVault),
                oldDeposit.owner,
                accruedInterest
            );
            principalVault.receiveDirectDeposit(
                oldDeposit.owner,
                accruedInterest
            );
        }

        // ================================================================
        // STEP 5: Collect migration fee
        // ================================================================
        if (migrationFee > 0) {
            principalVault.withdrawPrincipal(feeReceiver, migrationFee);
        }

        // ================================================================
        // STEP 6: Create new deposit
        // ================================================================
        uint256 newDepositId = nextDepositId;
        uint256 newMaturity = block.timestamp + (newPlan.tenorDays * 1 days);

        depositCertificates[newDepositId] = DepositCertificate({
            owner: msg.sender,
            planId: newPlanId,
            principal: newPrincipal,
            startAt: block.timestamp,
            maturityAt: newMaturity,
            status: DepositStatus.Active,
            renewedDepositId: 0,
            snapshotAprBps: newPlan.aprBps,
            snapshotTenorDays: newPlan.tenorDays,
            snapshotEarlyWithdrawPenaltyBps: newPlan.earlyWithdrawPenaltyBps,
            autoCompound: false, // Reset to false
            lastCompoundTime: block.timestamp,
            accumulatedInterest: 0,
            totalPartialWithdrawn: 0
        });

        userDepositIds[msg.sender].push(newDepositId);
        nextDepositId++;

        // ================================================================
        // STEP 7: Update old deposit status
        // ================================================================
        oldDeposit.status = DepositStatus.Renewed;
        oldDeposit.renewedDepositId = newDepositId;

        // ================================================================
        // STEP 8: Handle NFT (burn old, mint new)
        // ================================================================
        nft.burn(depositId);
        nft.mint(msg.sender, newDepositId, newPlanId, newPrincipal);

        emit PlanMigrated(
            depositId,
            newDepositId,
            oldDeposit.planId,
            newPlanId,
            accruedInterest,
            migrationFee,
            newPrincipal
        );

        emit DepositCertificateOpened(
            newDepositId,
            msg.sender,
            newPlanId,
            newPrincipal,
            newMaturity
        );
    }

    /*//////////////////////////////////////////////////////////////
                       OPERATOR FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Operator tạo plan mới
     */
    function createPlan(
        uint256 tenorDays,
        uint256 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 earlyWithdrawPenaltyBps
    ) external onlyRole(OPERATOR_ROLE) {
        if (tenorDays == 0) revert InvalidTenor();
        if (aprBps == 0) revert InvalidAPR();
        if (minDeposit == 0) revert InvalidMinDeposit();
        if (maxDeposit > 0 && maxDeposit < minDeposit)
            revert InvalidMaxDeposit();
        if (
            earlyWithdrawPenaltyBps == 0 ||
            earlyWithdrawPenaltyBps > BASIS_POINTS
        ) revert NotExceed();

        uint256 newPlanId = nextPlanId;

        savingPlans[newPlanId] = SavingPlan({
            tenorDays: tenorDays,
            aprBps: aprBps,
            minDeposit: minDeposit,
            maxDeposit: maxDeposit,
            earlyWithdrawPenaltyBps: earlyWithdrawPenaltyBps,
            enabled: true
        });

        nextPlanId++;

        emit PlanCreated(
            newPlanId,
            tenorDays,
            aprBps,
            minDeposit,
            maxDeposit,
            earlyWithdrawPenaltyBps
        );
    }

    /**
     * @notice Operator update plan status
     */
    function updatePlanStatus(
        uint256 planId,
        bool isEnabled
    ) external onlyRole(OPERATOR_ROLE) {
        if (planId <= 0 || planId >= nextPlanId) revert InvalidPlanId();
        savingPlans[planId].enabled = isEnabled;
        emit PlanUpdated(planId, isEnabled);
    }

    /**
     * @notice Operator update plan
     */
    function updatePlan(
        uint256 planId,
        uint256 tenorDays,
        uint256 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 earlyWithdrawPenaltyBps
    ) external onlyTimelockOrAdmin {
        if (planId <= 0 || planId >= nextPlanId) revert InvalidPlanId();
        if (tenorDays == 0) revert InvalidTenor();
        if (aprBps == 0) revert InvalidAPR();
        if (minDeposit == 0) revert InvalidMinDeposit();
        if (maxDeposit > 0 && maxDeposit < minDeposit)
            revert InvalidMaxDeposit();
        if (
            earlyWithdrawPenaltyBps == 0 ||
            earlyWithdrawPenaltyBps > BASIS_POINTS
        ) revert NotExceed();

        SavingPlan storage plan = savingPlans[planId];

        uint256 oldAPR = plan.aprBps;
        uint256 oldTenor = plan.tenorDays;

        plan.tenorDays = tenorDays;
        plan.aprBps = aprBps;
        plan.minDeposit = minDeposit;
        plan.maxDeposit = maxDeposit;
        plan.earlyWithdrawPenaltyBps = earlyWithdrawPenaltyBps;

        emit PlanParametersUpdated(
            planId,
            oldAPR,
            aprBps,
            oldTenor,
            tenorDays,
            msg.sender
        );

        emit PlanUpdated(planId, plan.enabled);
    }

    /*//////////////////////////////////////////////////////////////
                          ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function setVaults(
        address newPrincipalVault,
        address newInterestVault
    ) external onlyTimelockOrAdmin {
        if (newPrincipalVault == address(0)) revert InvalidVault();
        if (newInterestVault == address(0)) revert InvalidVault();

        principalVault = IPrincipalVault(newPrincipalVault);
        interestVault = IInterestVault(newInterestVault);

        emit VaultUpdated(newPrincipalVault, newInterestVault);
    }

    function setNFT(address newNFT) external onlyRole(ADMIN_ROLE) {
        if (newNFT == address(0)) revert InvalidNFT();
        nft = ISavingBankNFT(newNFT);
        emit NFTUpdated(newNFT);
    }

    function setFeeReceiver(
        address newFeeReceiver
    ) external onlyTimelockOrAdmin {
        if (newFeeReceiver == address(0)) revert InvalidAddress();
        feeReceiver = newFeeReceiver;
        emit FeeReceiverUpdated(newFeeReceiver);
    }

    /**
     * @notice Set timelock address
     * @dev Only ADMIN can set timelock
     */
    function setTimelock(address newTimelock) external onlyRole(ADMIN_ROLE) {
        if (newTimelock == address(0)) revert InvalidTimelock();
        timelock = newTimelock;
        emit TimelockUpdated(newTimelock);
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice Override required by UUPSUpgradeable - chỉ ADMIN mới upgrade được
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(ADMIN_ROLE) {}

    /**
     * @notice Set migration fee
     * @dev Only admin or timelock can set
     * @param newFeeBps New fee in basis points (max 5%)
     */
    function setMigrationFee(uint256 newFeeBps) external onlyTimelockOrAdmin {
        if (newFeeBps > MAX_MIGRATION_FEE_BPS) revert MigrationFeeExceedsMax();

        uint256 oldFee = migrationFeeBps;
        migrationFeeBps = newFeeBps;

        emit MigrationFeeUpdated(oldFee, newFeeBps);
    }

    /*//////////////////////////////////////////////////////////////
                          VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function getPlanInfo(
        uint256 planId
    )
        external
        view
        returns (
            uint256 tenorDays,
            uint256 aprBps,
            uint256 minDeposit,
            uint256 maxDeposit,
            uint256 earlyWithdrawPenaltyBps,
            bool enabled
        )
    {
        SavingPlan memory plan = savingPlans[planId];
        return (
            plan.tenorDays,
            plan.aprBps,
            plan.minDeposit,
            plan.maxDeposit,
            plan.earlyWithdrawPenaltyBps,
            plan.enabled
        );
    }

    function getUserDepositIds(
        address user
    ) external view returns (uint256[] memory) {
        return userDepositIds[user];
    }

    function getCalculateInterest(
        uint256 depositId
    ) external view returns (uint256) {
        return _calculateInterest(depositId);
    }

    function getDepositInfo(
        uint256 depositId
    )
        external
        view
        returns (
            address owner,
            uint256 planId,
            uint256 principal,
            uint256 startAt,
            uint256 maturityAt,
            DepositStatus status,
            uint256 renewedDepositId
        )
    {
        DepositCertificate memory deposit = depositCertificates[depositId];
        return (
            deposit.owner,
            deposit.planId,
            deposit.principal,
            deposit.startAt,
            deposit.maturityAt,
            deposit.status,
            deposit.renewedDepositId
        );
    }

    /**
     * @notice Get available balance for partial withdrawal
     */
    function getAvailableBalance(
        uint256 depositId
    ) external view returns (uint256 available, uint256 minRemaining) {
        DepositCertificate memory deposit = depositCertificates[depositId];
        SavingPlan memory plan = savingPlans[deposit.planId];

        available = deposit.principal - deposit.totalPartialWithdrawn;
        minRemaining = plan.minDeposit;
    }

    /**
     * @notice Get maximum withdrawable amount
     */
    function getMaxPartialWithdraw(
        uint256 depositId
    ) external view returns (uint256) {
        DepositCertificate memory deposit = depositCertificates[depositId];
        SavingPlan memory plan = savingPlans[deposit.planId];

        uint256 available = deposit.principal - deposit.totalPartialWithdrawn;

        // Can withdraw all except minDeposit
        if (available <= plan.minDeposit) return 0;
        return available - plan.minDeposit;
    }

    /**
     * @notice Get partial withdrawal history
     */
    function getPartialWithdrawalHistory(
        uint256 depositId
    ) external view returns (PartialWithdrawal[] memory) {
        return partialWithdrawHistory[depositId];
    }

    /**
     * @notice Preview migration details before executing
     * @param depositId Current deposit ID
     * @param newPlanId Plan ID to migrate to
     * @return currentInterest Accrued interest up to now
     * @return newMaturityDate New maturity timestamp
     * @return fee Migration fee to be charged
     * @return newPrincipalAmount Principal amount in new plan
     */
    function getMigrationPreview(
        uint256 depositId,
        uint256 newPlanId
    )
        external
        view
        returns (
            uint256 currentInterest,
            uint256 newMaturityDate,
            uint256 fee,
            uint256 newPrincipalAmount
        )
    {
        DepositCertificate memory deposit = depositCertificates[depositId];
        SavingPlan memory newPlan = savingPlans[newPlanId];

        if (deposit.status != DepositStatus.Active) revert NotActiveDeposit();
        if (!newPlan.enabled) revert NotEnabledPlan();

        // Calculate current principal after partial withdrawals
        uint256 currentPrincipal = deposit.principal -
            deposit.totalPartialWithdrawn;

        // Calculate accrued interest
        if (deposit.autoCompound) {
            uint256 timePassed = block.timestamp - deposit.lastCompoundTime;
            currentInterest =
                (currentPrincipal * deposit.snapshotAprBps * timePassed) /
                (SECONDS_PER_YEAR * BASIS_POINTS);
        } else if (deposit.accumulatedInterest > 0) {
            uint256 timePassed = block.timestamp - deposit.lastCompoundTime;
            currentInterest =
                (currentPrincipal * deposit.snapshotAprBps * timePassed) /
                (SECONDS_PER_YEAR * BASIS_POINTS);
        } else {
            uint256 timePassed = block.timestamp - deposit.startAt;
            currentInterest =
                (currentPrincipal * deposit.snapshotAprBps * timePassed) /
                (SECONDS_PER_YEAR * BASIS_POINTS);
        }

        // Calculate new amounts
        uint256 principalWithInterest = currentPrincipal + currentInterest;
        fee = (principalWithInterest * migrationFeeBps) / BASIS_POINTS;
        newPrincipalAmount = principalWithInterest - fee;

        // Calculate new maturity
        newMaturityDate = block.timestamp + (newPlan.tenorDays * 1 days);

        return (currentInterest, newMaturityDate, fee, newPrincipalAmount);
    }

    /**
     * @notice Get migration fee percentage
     * @return Fee in basis points
     */
    function getMigrationFee() external view returns (uint256) {
        return migrationFeeBps;
    }

    /**
     * @notice Check if deposit is eligible for migration
     * @param depositId Deposit to check
     * @return eligible True if can migrate
     * @return reason Reason if not eligible
     */
    function canMigrate(
        uint256 depositId
    ) external view returns (bool eligible, string memory reason) {
        DepositCertificate memory deposit = depositCertificates[depositId];

        if (deposit.status != DepositStatus.Active) {
            return (false, "Deposit not active");
        }

        if (block.timestamp >= deposit.maturityAt) {
            return (false, "Already matured");
        }

        return (true, "");
    }

    /*//////////////////////////////////////////////////////////////
                         HELPER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function _calculateInterest(
        uint256 depositId
    ) internal view returns (uint256) {
        DepositCertificate memory deposit = depositCertificates[depositId];

        uint256 tenorSeconds = deposit.snapshotTenorDays * 1 days;

        uint256 interestAmount = (deposit.principal *
            deposit.snapshotAprBps *
            tenorSeconds) / (SECONDS_PER_YEAR * BASIS_POINTS);

        return interestAmount;
    }

    /**
     * @notice Calculate time-based penalty for partial withdrawal
     * @dev Penalty reduces as time passes:
     *      Early (start) = Full penalty rate
     *      Late (near maturity) = Lower penalty
     *
     * Formula: penalty = amount × (timeRemaining/totalTime) × penaltyRate
     */
    function _calculatePartialWithdrawPenalty(
        uint256 depositId,
        uint256 amount
    ) internal view returns (uint256) {
        DepositCertificate memory deposit = depositCertificates[depositId];

        uint256 totalDuration = deposit.maturityAt - deposit.startAt;
        uint256 timeElapsed = block.timestamp - deposit.startAt;
        uint256 timeRemaining = totalDuration - timeElapsed;

        // Penalty = amount × (timeRemaining/totalDuration) × penaltyBps / 10000
        uint256 penalty = (amount *
            timeRemaining *
            deposit.snapshotEarlyWithdrawPenaltyBps) /
            (totalDuration * BASIS_POINTS);

        return penalty;
    }

    /**
     * @notice Calculate interest on remaining principal (after partial withdrawals)
     */
    function _calculateInterestOnRemaining(
        uint256 depositId
    ) internal view returns (uint256) {
        DepositCertificate memory deposit = depositCertificates[depositId];

        // Current principal after partial withdrawals
        uint256 currentPrincipal = deposit.principal -
            deposit.totalPartialWithdrawn;

        // Calculate based on CURRENT principal
        uint256 tenorSeconds = deposit.snapshotTenorDays * 1 days;
        uint256 interest = (currentPrincipal *
            deposit.snapshotAprBps *
            tenorSeconds) / (SECONDS_PER_YEAR * BASIS_POINTS);

        return interest;
    }

    /*//////////////////////////////////////////////////////////////
                          STORAGE GAP
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Storage gap for future upgrades
     * Giảm gap khi thêm state variables mới
     */
    uint256[46] private __gap;
}
