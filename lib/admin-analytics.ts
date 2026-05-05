import { prisma } from './prisma';
import { Logger } from './logger';
import { toError } from './runtime-guards';
import type { AdminAnalyticsPeriod, AdminAnalyticsResponse } from './admin-analytics-shared';

const DAY_MS = 24 * 60 * 60 * 1000;

function getDayKey(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function sortDayBucketsDesc<T extends { date: string }>(buckets: T[]): T[] {
	return buckets.sort((left, right) => right.date.localeCompare(left.date));
}

function buildCountBuckets(records: Array<{ createdAt: Date }>): Array<{ date: string; count: number }> {
	const counts = new Map<string, number>();

	for (const record of records) {
		const dayKey = getDayKey(record.createdAt);
		counts.set(dayKey, (counts.get(dayKey) ?? 0) + 1);
	}

	return sortDayBucketsDesc(
		Array.from(counts.entries(), ([date, count]) => ({ date, count }))
	);
}

function buildRevenueBuckets(records: Array<{ createdAt: Date; amountCents: number }>): Array<{ date: string; revenue: number }> {
	const revenue = new Map<string, number>();

	for (const record of records) {
		const dayKey = getDayKey(record.createdAt);
		revenue.set(dayKey, (revenue.get(dayKey) ?? 0) + record.amountCents);
	}

	return sortDayBucketsDesc(
		Array.from(revenue.entries(), ([date, amountCents]) => ({
			date,
			revenue: amountCents / 100,
		}))
	);
}

function buildTopCounts(items: Array<string | null | undefined>, limit: number): Array<{ value: string; count: number }> {
	const counts = new Map<string, number>();

	for (const item of items) {
		if (!item) continue;
		counts.set(item, (counts.get(item) ?? 0) + 1);
	}

	return Array.from(counts.entries(), ([value, count]) => ({ value, count }))
		.sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
		.slice(0, limit);
}

export async function getAdminAnalytics(period: AdminAnalyticsPeriod = '30d'): Promise<AdminAnalyticsResponse> {
	try {
		const now = new Date();
		const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
		const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
		const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
		let startDate: Date;
		const endDate: Date = now;

		switch (period) {
			case 'today':
				startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
				break;
			case 'yesterday':
				startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
				break;
			case '1d':
				startDate = new Date(now.getTime() - 1 * DAY_MS);
				break;
			case '7d':
				startDate = new Date(now.getTime() - 7 * DAY_MS);
				break;
			case '30d':
				startDate = new Date(now.getTime() - 30 * DAY_MS);
				break;
			case '90d':
				startDate = new Date(now.getTime() - 90 * DAY_MS);
				break;
			case '3m':
				startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
				break;
			case '6m':
				startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
				break;
			case '1y':
				startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
				break;
			case 'all':
				startDate = new Date('2020-01-01');
				break;
			default:
				startDate = new Date(now.getTime() - 30 * DAY_MS);
		}

		const periodLength = endDate.getTime() - startDate.getTime();
		const previousStartDate = new Date(startDate.getTime() - periodLength);
		const previousEndDate = new Date(startDate.getTime());

		const [
			totalRevenue,
			currentPeriodRevenue,
			previousPeriodRevenue,
			dailyRevenue,
			yesterdayRevenue,
			totalUsers,
			activeUsers,
			currentPeriodUsers,
			previousPeriodUsers,
			usersByDayRecords,
			usersToday,
			usersThisWeek,
			totalSubs,
			activeSubs,
			pendingSubs,
			canceledSubs,
			planRevenueByPlan,
			plans,
			featureUsage,
			currentPeriodSubs,
			previousPeriodSubs,
			revenueByDayRecords,
			subscriptionsByDayRecords,
			totalVisits,
			currentPeriodVisits,
			previousPeriodVisits,
			currentPeriodVisitRecords
		] = await Promise.all([
			prisma.payment.aggregate({
				_sum: { amountCents: true },
				where: { status: { in: ['COMPLETED', 'SUCCEEDED'] } }
			}),
			prisma.payment.aggregate({
				_sum: { amountCents: true },
				where: {
					status: { in: ['COMPLETED', 'SUCCEEDED'] },
					createdAt: { gte: startDate, lt: endDate }
				}
			}),
			prisma.payment.aggregate({
				_sum: { amountCents: true },
				where: {
					status: { in: ['COMPLETED', 'SUCCEEDED'] },
					createdAt: { gte: previousStartDate, lt: previousEndDate }
				}
			}),
			prisma.payment.aggregate({
				_sum: { amountCents: true },
				where: {
					status: { in: ['COMPLETED', 'SUCCEEDED'] },
					createdAt: { gte: startOfToday, lt: startOfTomorrow }
				}
			}),
			prisma.payment.aggregate({
				_sum: { amountCents: true },
				where: {
					status: { in: ['COMPLETED', 'SUCCEEDED'] },
					createdAt: { gte: startOfYesterday, lt: startOfToday }
				}
			}),
			prisma.user.count(),
			prisma.user.count({
				where: { subscriptions: { some: { status: 'ACTIVE' } } }
			}),
			prisma.user.count({ where: { createdAt: { gte: startDate, lt: endDate } } }),
			prisma.user.count({
				where: { createdAt: { gte: previousStartDate, lt: previousEndDate } }
			}),
			prisma.user.findMany({
				where: { createdAt: { gte: startDate, lt: endDate } },
				select: { createdAt: true }
			}),
			prisma.user.count({ where: { createdAt: { gte: startOfToday, lt: startOfTomorrow } } }),
			prisma.user.count({ where: { createdAt: { gte: startOfWeek, lt: startOfTomorrow } } }),
			prisma.subscription.count(),
			prisma.subscription.count({ where: { status: 'ACTIVE' } }),
			prisma.subscription.count({ where: { status: 'PENDING' } }),
			// Count canonical 'CANCELLED' only now that DB rows have been normalized
			prisma.subscription.count({ where: { status: 'CANCELLED' } }),
			prisma.payment.groupBy({
				by: ['planId'],
				_sum: { amountCents: true },
				where: {
					status: { in: ['COMPLETED', 'SUCCEEDED'] },
					createdAt: { gte: startDate, lt: endDate },
					planId: { not: null },
				}
			}),
			prisma.plan.findMany({
				select: {
					id: true,
					name: true,
					subscriptions: {
						select: { userId: true }
					}
				}
			}),
			prisma.featureUsageLog.groupBy({
				by: ['feature'],
				_sum: { count: true },
				_count: { userId: true },
				where: { createdAt: { gte: startDate, lt: endDate } },
				orderBy: { _sum: { count: 'desc' } }
			}),
			prisma.subscription.count({ where: { createdAt: { gte: startDate, lt: endDate } } }),
			prisma.subscription.count({
				where: { createdAt: { gte: previousStartDate, lt: previousEndDate } }
			}),
			prisma.payment.findMany({
				where: {
					status: { in: ['COMPLETED', 'SUCCEEDED'] },
					createdAt: { gte: startDate, lt: endDate }
				},
				select: { createdAt: true, amountCents: true }
			}),
			prisma.subscription.findMany({
				where: { createdAt: { gte: startDate, lt: endDate } },
				select: { createdAt: true }
			}),
			prisma.visitLog.count().catch(() => 0),
			prisma.visitLog.count({ where: { createdAt: { gte: startDate, lt: endDate } } }).catch(() => 0),
			prisma.visitLog.count({ where: { createdAt: { gte: previousStartDate, lt: previousEndDate } } }).catch(() => 0),
			prisma.visitLog.findMany({
				where: { createdAt: { gte: startDate, lt: endDate } },
				select: {
					sessionId: true,
					country: true,
					path: true,
				}
			}).catch(() => [])
		]);

		const currentPeriodRevenueAmount = (currentPeriodRevenue._sum.amountCents || 0) / 100;
		const previousPeriodRevenueAmount = (previousPeriodRevenue._sum.amountCents || 0) / 100;
		const totalRevenueAmount = (totalRevenue._sum.amountCents || 0) / 100;
		const dailyRevenueAmount = (dailyRevenue._sum.amountCents || 0) / 100;
		const yesterdayRevenueAmount = (yesterdayRevenue._sum.amountCents || 0) / 100;

		const totalVisitsNum = Number(totalVisits);
		const currentPeriodVisitsNum = Number(currentPeriodVisits);
		const previousPeriodVisitsNum = Number(previousPeriodVisits);
		const uniqueVisitorsNum = new Set(currentPeriodVisitRecords.map((visit) => visit.sessionId)).size;

		const totalUsersNum = Number(totalUsers);
		const activeUsersNum = Number(activeUsers);
		const currentPeriodUsersNum = Number(currentPeriodUsers);
		const previousPeriodUsersNum = Number(previousPeriodUsers);
		const usersTodayNum = Number(usersToday);
		const usersThisWeekNum = Number(usersThisWeek);

		const totalSubsNum = Number(totalSubs);
		const activeSubsNum = Number(activeSubs);
		const pendingSubsNum = Number(pendingSubs);
		const canceledSubsNum = Number(canceledSubs);
		const currentPeriodSubsNum = Number(currentPeriodSubs);
		const previousPeriodSubsNum = Number(previousPeriodSubs);

		const revenueGrowthRate = previousPeriodRevenueAmount > 0
			? ((currentPeriodRevenueAmount - previousPeriodRevenueAmount) / previousPeriodRevenueAmount) * 100
			: 0;

		const userGrowthRate = previousPeriodUsersNum > 0
			? ((currentPeriodUsersNum - previousPeriodUsersNum) / previousPeriodUsersNum) * 100
			: 0;

		const conversionRate = totalUsersNum > 0 ? (activeSubsNum / totalUsersNum) * 100 : 0;
		const churnRate = totalSubsNum > 0 ? (canceledSubsNum / totalSubsNum) * 100 : 0;

		const periodDays = Math.ceil(periodLength / DAY_MS);
		const dailyAvgRevenue = periodDays > 0 ? currentPeriodRevenueAmount / periodDays : 0;
		const mrr = dailyAvgRevenue * 30;
		const arr = mrr * 12;

		const planRevenueById = new Map(
			planRevenueByPlan
				.filter((entry) => entry.planId)
				.map((entry) => [entry.planId as string, entry._sum.amountCents ?? 0])
		);
		const totalPlanRevenue = Array.from(planRevenueById.values()).reduce((sum, revenue) => sum + revenue, 0);

		const planData = plans
			.map((plan) => {
				const revenueCents = planRevenueById.get(plan.id) ?? 0;
				const distinctUsers = new Set(plan.subscriptions.map((subscription) => subscription.userId)).size;

				return {
					id: plan.id,
					name: plan.name,
					revenue: revenueCents / 100,
					users: distinctUsers,
					percentage: totalPlanRevenue > 0 ? (revenueCents / totalPlanRevenue) * 100 : 0,
				};
			})
			.sort((left, right) => right.revenue - left.revenue || left.name.localeCompare(right.name));

		const featureArr = Array.isArray(featureUsage)
			? (featureUsage as Array<Record<string, unknown>>)
			: [];
		const featureData = featureArr.map((feature) => ({
			name: String(feature['feature'] ?? ''),
			usage: Number((feature['_sum'] as Record<string, unknown>)?.['count'] ?? 0) || 0,
			users: Number((feature['_count'] as Record<string, unknown>)?.['userId'] ?? 0) || 0,
			adoptionRate:
				currentPeriodUsersNum > 0
					? ((Number((feature['_count'] as Record<string, unknown>)?.['userId'] ?? 0) / currentPeriodUsersNum) * 100)
					: 0
		}));

		const subscriptionGrowthRate = previousPeriodSubsNum > 0
			? ((currentPeriodSubsNum - previousPeriodSubsNum) / previousPeriodSubsNum) * 100
			: 0;

		const processedRevenueByDay = buildRevenueBuckets(revenueByDayRecords);
		const processedSubscriptionsByDay = buildCountBuckets(subscriptionsByDayRecords).map((day) => ({
			date: day.date,
			subscriptions: day.count,
		}));
		const userGrowthData = buildCountBuckets(usersByDayRecords).map((day) => ({
			date: day.date,
			users: day.count,
		}));

		const visitGrowthRate = previousPeriodVisitsNum > 0
			? ((currentPeriodVisitsNum - previousPeriodVisitsNum) / previousPeriodVisitsNum) * 100
			: 0;

		const bounceRate = currentPeriodVisitsNum > 0
			? ((currentPeriodVisitsNum - uniqueVisitorsNum) / currentPeriodVisitsNum) * 100
			: 0;

		const visitsByCountryData = buildTopCounts(
			currentPeriodVisitRecords.map((visit) => visit.country),
			10
		).map((country) => ({
			country: country.value,
			visits: country.count,
			percentage: currentPeriodVisitsNum > 0 ? (country.count / currentPeriodVisitsNum) * 100 : 0,
		}));
		const pageViewsData = buildTopCounts(
			currentPeriodVisitRecords.map((visit) => visit.path),
			10
		).map((page) => ({
			path: page.value,
			views: page.count,
			percentage: currentPeriodVisitsNum > 0 ? (page.count / currentPeriodVisitsNum) * 100 : 0,
		}));

		return {
			period,
			startDate: startDate.toISOString(),
			endDate: endDate.toISOString(),
			revenue: {
				total: totalRevenueAmount,
				currentPeriod: currentPeriodRevenueAmount,
				previousPeriod: previousPeriodRevenueAmount,
				daily: dailyRevenueAmount,
				yesterday: yesterdayRevenueAmount,
				growth: revenueGrowthRate,
				mrr,
				arr,
				chartData: processedRevenueByDay
			},
			users: {
				total: totalUsersNum,
				active: activeUsersNum,
				currentPeriod: currentPeriodUsersNum,
				previousPeriod: previousPeriodUsersNum,
				growth: userGrowthRate,
				growthData: userGrowthData,
				today: usersTodayNum,
				thisWeek: usersThisWeekNum
			},
			subscriptions: {
				total: totalSubsNum,
				active: activeSubsNum,
				pending: pendingSubsNum,
				canceled: canceledSubsNum,
				currentPeriod: currentPeriodSubsNum,
				previousPeriod: previousPeriodSubsNum,
				growth: subscriptionGrowthRate,
				conversionRate,
				churnRate,
				chartData: processedSubscriptionsByDay
			},
			plans: planData,
			features: featureData,
			visits: {
				total: totalVisitsNum,
				currentPeriod: currentPeriodVisitsNum,
				previousPeriod: previousPeriodVisitsNum,
				growth: visitGrowthRate,
				uniqueVisitors: uniqueVisitorsNum,
				bounceRate,
				countries: visitsByCountryData,
				pages: pageViewsData
			},
			charts: {
				revenue: processedRevenueByDay,
				subscriptions: processedSubscriptionsByDay,
				users: userGrowthData
			}
		};
	} catch (error: unknown) {
		const err = toError(error);
		Logger.error('getAdminAnalytics failed', { error: err.message });
		throw err;
	}
}
