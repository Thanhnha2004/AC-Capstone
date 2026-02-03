// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * @title SavingBankTimelock
 * @notice Timelock controller for SavingBank upgrade governance
 * @dev Enforces minimum 2-day delay before executing critical operations
 *
 * Key Features:
 * - 2-day minimum delay for all operations
 * - Role-based access (Proposers, Executors, Admin)
 * - Transparent upgrade process
 * - Emergency cancellation capability
 */
contract SavingBankTimelock is TimelockController {
    /*//////////////////////////////////////////////////////////////
                              CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Minimum delay before execution (2 days)
    uint256 public constant MIN_DELAY = 2 days;

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    event TimelockDeployed(
        uint256 minDelay,
        address[] proposers,
        address[] executors,
        address admin
    );

    /*//////////////////////////////////////////////////////////////
                             CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Initialize timelock with roles
     * @param proposers Addresses that can propose operations
     * @param executors Addresses that can execute operations
     * @param admin Admin address (can manage roles)
     *
     * @dev Roles:
     * - PROPOSER_ROLE: Can schedule operations
     * - EXECUTOR_ROLE: Can execute operations after delay
     * - CANCELLER_ROLE: Can cancel pending operations
     * - DEFAULT_ADMIN_ROLE: Can grant/revoke roles
     */
    constructor(
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) TimelockController(MIN_DELAY, proposers, executors, admin) {
        emit TimelockDeployed(MIN_DELAY, proposers, executors, admin);
    }

    /*//////////////////////////////////////////////////////////////
                          VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Get the minimum delay
     * @return Minimum delay in seconds
     */
    function getMinDelay() public pure override returns (uint256) {
        return MIN_DELAY;
    }

    /**
     * @notice Check if address has proposer role
     */
    function isProposer(address account) external view returns (bool) {
        return hasRole(PROPOSER_ROLE, account);
    }

    /**
     * @notice Check if address has executor role
     */
    function isExecutor(address account) external view returns (bool) {
        return hasRole(EXECUTOR_ROLE, account);
    }

    /**
     * @notice Check if address has canceller role
     */
    function isCanceller(address account) external view returns (bool) {
        return hasRole(CANCELLER_ROLE, account);
    }
}
